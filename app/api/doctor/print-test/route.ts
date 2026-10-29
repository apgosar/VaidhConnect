import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { renderSamplePrescriptionPdf } from '@/lib/modules/documents'
import { parsePrintMode } from '@/lib/pdf/layout'
import { pdfResponse } from '@/lib/pdfHttp'
import { apiError } from '@/lib/errors'

export const runtime = 'nodejs'

// GET /api/doctor/print-test?mode=standard|preprinted — a made-up prescription laid out with the clinic's
// current spacing and letterhead, to check alignment on real paper without writing a real prescription.
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const gated = featureGate(tenant, 'prescriptions')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'settings:manage')
    if (denied) return denied

    const pdf = await renderSamplePrescriptionPdf(tenant, parsePrintMode(new URL(request.url).searchParams.get('mode')))
    if (!pdf) return Response.json({ error: 'Clinic profile not found' }, { status: 404 })
    return pdfResponse(pdf.buffer, pdf.filename, true)
  } catch (error) {
    console.error('[print-test]', error)
    return Response.json({ error: 'Could not create the test page' }, { status: 500 })
  }
}
