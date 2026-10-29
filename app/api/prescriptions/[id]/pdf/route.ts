import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { renderPrescriptionPdf } from '@/lib/modules/documents'
import { pdfResponse } from '@/lib/pdfHttp'

export const runtime = 'nodejs'

// GET /api/prescriptions/[id]/pdf — the prescription as a PDF, built on the server
// from what is saved. `?inline=1` opens it in the browser's viewer (for printing)
// instead of downloading it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const gated = featureGate(tenant, 'prescriptions')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const denied = forbid(session, 'prescriptions:manage')
    if (denied) return denied

    const { id } = await params
    const pdf = await renderPrescriptionPdf(tenant, id)
    if (!pdf) return Response.json({ error: 'Prescription not found' }, { status: 404 })

    const inline = new URL(request.url).searchParams.get('inline') === '1'
    await audit(tenant, session, inline ? 'prescription.print' : 'prescription.download', `prescriptions/${id}`)
    return pdfResponse(pdf.buffer, pdf.filename, inline)
  } catch (error) {
    console.error('[prescription-pdf-get]', error)
    return Response.json({ error: 'Could not create the PDF' }, { status: 500 })
  }
}
