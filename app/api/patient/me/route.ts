import { getTenant } from '@/lib/tenant/resolve'
import { getPatientSession } from '@/lib/auth/patientPin'
import { listMyAppointments } from '@/lib/modules/patientAccess'
import { apiError } from '@/lib/errors'

// GET /api/patient/me — the signed-in (PIN) patient's upcoming appointments.
// Which appointments appear depends on whether their PIN is verified; see
// listMyAppointments. Never returns medical history or any clinic notes.
export async function GET() {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getPatientSession(tenant)
    if (!session) return Response.json({ authenticated: false }, { status: 401 })

    return Response.json({
      authenticated: true,
      phone: session.phone,
      verified: session.verified,
      appointments: await listMyAppointments(tenant, session),
    })
  } catch (e) {
    console.error('[patient-me]', e)
    return apiError('SERVER_ERROR')
  }
}
