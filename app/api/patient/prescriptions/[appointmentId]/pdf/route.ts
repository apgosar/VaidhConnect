import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getPatientSession } from '@/lib/auth/patientPin'
import { sessionOwnsAppointment } from '@/lib/modules/patientAccess'
import { renderPrescriptionPdf } from '@/lib/modules/documents'
import { rateLimit } from '@/lib/ratelimit'
import { pdfResponse } from '@/lib/pdfHttp'
import { apiError } from '@/lib/errors'

export const runtime = 'nodejs'

const DOWNLOADS_PER_HOUR = 30

// GET /api/patient/prescriptions/[appointmentId]/pdf — a patient downloads their own prescription.
// Needs the PIN session, and the visit must belong to that session by the same rule as My Appointments.
// Anything that does not fit (wrong visit, someone else's, no prescription) is the same 404, so the
// answer never reveals whether a visit exists.
export async function GET(_request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    if (featureGate(tenant, 'prescriptions')) return apiError('NOT_FOUND')
    const session = await getPatientSession(tenant)
    if (!session) return Response.json({ error: 'Please sign in with your PIN' }, { status: 401 })

    const db = tenantDb(tenant)
    if (!(await rateLimit(db, `rx-dl:${session.accessId}`, DOWNLOADS_PER_HOUR, 3600))) {
      return Response.json({ error: 'Too many downloads. Please try again later.' }, { status: 429 })
    }

    const { appointmentId } = await params
    const apptSnap = await db.col('appointments').doc(appointmentId).get()
    const appt = apptSnap.data() as any
    if (!apptSnap.exists || appt.status === 'CANCELLED') return apiError('NOT_FOUND')

    const patient = (await db.col('patients').doc(String(appt.patientId)).get()).data() as { phone?: string } | undefined
    if (!sessionOwnsAppointment(session, appt, patient?.phone ?? null)) return apiError('NOT_FOUND')

    const rx = await db.col('prescriptions').where('appointmentId', '==', appointmentId).limit(1).get()
    if (rx.empty) return apiError('NOT_FOUND')

    const pdf = await renderPrescriptionPdf(tenant, rx.docs[0].id)
    if (!pdf) return apiError('NOT_FOUND')
    return pdfResponse(pdf.buffer, pdf.filename)
  } catch (error) {
    console.error('[patient-prescription-pdf]', error)
    return Response.json({ error: 'Could not create the PDF' }, { status: 500 })
  }
}
