import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/ratelimit'
import { renderPrescriptionPdf } from '@/lib/modules/documents'
import { getSignedDownloadUrl, uploadFile } from '@/lib/storage'
import { sendPrescription } from '@/lib/whatsapp'

export const runtime = 'nodejs'

/** How long Meta has to fetch the file. It fetches within seconds of the send; the rest is margin for retries. */
const LINK_MINUTES = 60
const SHARES_PER_HOUR = 5

const mask = (phone: string) => (phone.length > 6 ? `${phone.slice(0, 3)}${'*'.repeat(phone.length - 5)}${phone.slice(-2)}` : phone)

// POST /api/prescriptions/[id]/whatsapp — send the saved prescription to the patient's WhatsApp as a PDF.
// The file goes to private storage and Meta is given a short-lived link to it; the link is never shown to anyone.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    for (const feature of ['prescriptions', 'whatsapp'] as const) {
      const gated = featureGate(tenant, feature)
      if (gated) return gated
    }
    const session = await getSession()
    if (!session?.uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const denied = forbid(session, 'prescriptions:manage')
    if (denied) return denied

    const { id } = await params
    const db = tenantDb(tenant)

    // A clinic can resend a few times (wrong number corrected, patient lost it), not loop.
    if (!(await rateLimit(db, `rx-share:${id}`, SHARES_PER_HOUR, 3600))) {
      return Response.json({ error: 'This prescription was sent several times in the last hour. Please try again later.' }, { status: 429 })
    }

    const pdf = await renderPrescriptionPdf(tenant, id)
    if (!pdf?.share) return Response.json({ error: 'Prescription not found' }, { status: 404 })
    const { share } = pdf
    if (!/^\+\d{8,15}$/.test(share.patientPhone)) {
      return Response.json({ error: 'This patient has no valid WhatsApp number on file' }, { status: 422 })
    }

    // Deliberately under a top-level shares/ prefix (not clinics/<id>/...) so one storage lifecycle rule
    // can delete every clinic's copies a few days after sending. Clinic id in the path keeps them apart.
    const path = `shares/${tenant.clinicId}/${id}/${Date.now()}.pdf`
    await uploadFile(pdf.buffer, path, 'application/pdf')
    const result = await sendPrescription(share.patientPhone, {
      patientName: share.patientName,
      clinicName: share.clinicName,
      visitDate: share.visitDate,
      clinicPhone: share.clinicPhone,
      pdfUrl: await getSignedDownloadUrl(path, LINK_MINUTES),
      filename: pdf.filename,
    })

    await audit(tenant, session, result.ok ? 'prescription.share' : 'prescription.share_failed', `prescriptions/${id}`)
    if (!result.ok) return Response.json({ error: result.error ?? 'Could not send on WhatsApp' }, { status: 502 })
    return Response.json({ ok: true, to: mask(share.patientPhone), sentAt: new Date().toISOString() })
  } catch (error) {
    console.error('[prescription-share]', error)
    return Response.json({ error: 'Could not send the prescription' }, { status: 500 })
  }
}
