import { z } from 'zod'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/access'
import { getPatientSession } from '@/lib/auth/patientPin'
import { parseBody } from '@/lib/validation'
import { rateLimit } from '@/lib/ratelimit'
import { audit } from '@/lib/audit'
import { rescheduleAppointment, BookingError } from '@/lib/modules/booking'
import { apiError } from '@/lib/errors'

const schema = z.object({
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
})

// POST /api/appointments/[id]/reschedule — move an appointment to another open slot.
//  - Signed-in clinic staff may move any appointment, with no limits.
//  - A patient (PIN session) may move their own, within lib/reschedulePolicy.
// The new slot is validated exactly like a booking; the old slot is freed in the same transaction.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const parsed = await parseBody(request, schema)
    if ('error' in parsed) return parsed.error
    const { id } = await params

    const staff = await getSession()
    if (staff && can(staff.role, 'appointments:manage')) {
      const moved = await rescheduleAppointment(tenant, id, parsed.data, { kind: 'staff', uid: staff.uid })
      await audit(tenant, staff, 'appointment.reschedule', `appointments/${id}`)
      return Response.json({ appointment: moved })
    }
    if (staff) return apiError('FORBIDDEN')

    const patient = await getPatientSession(tenant)
    if (!patient) return apiError('UNAUTHORIZED')
    // Probing other people's appointments or hammering the slot list is bounded per PIN.
    if (!(await rateLimit(tenantDb(tenant), `resched:${patient.accessId}`, 10, 3600))) return apiError('RATE_LIMITED')
    const moved = await rescheduleAppointment(tenant, id, parsed.data, { kind: 'patient', session: patient })
    return Response.json({ appointment: moved })
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status })
    console.error('[appointment-reschedule]', error)
    return apiError('SERVER_ERROR')
  }
}
