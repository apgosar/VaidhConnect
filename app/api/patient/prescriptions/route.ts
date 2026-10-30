import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { getPatientSession } from '@/lib/auth/patientPin'
import { listMyPrescriptions } from '@/lib/modules/patientAccess'
import { apiError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

// GET /api/patient/prescriptions — past visits that have a prescription, for the signed-in (PIN) patient.
// Dates and names only; the prescription itself comes from the PDF route, which checks ownership again.
export async function GET() {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    // A clinic without prescriptions simply has none to show.
    if (featureGate(tenant, 'prescriptions')) return Response.json({ visits: [] })
    const session = await getPatientSession(tenant)
    if (!session) return Response.json({ authenticated: false }, { status: 401 })
    return Response.json({ visits: await listMyPrescriptions(tenant, session) })
  } catch (e) {
    console.error('[patient-prescriptions]', e)
    return apiError('SERVER_ERROR')
  }
}
