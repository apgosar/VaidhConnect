import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/access'
import { getPatientSession, startPatientSession } from '@/lib/auth/patientPin'
import { bookingSchema, parseBody } from '@/lib/validation'
import { clientIp } from '@/lib/ratelimit'
import { isValidYmd, ymdInTz } from '@/lib/time'
import { getDayAvailability } from '@/lib/modules/availability'
import { bookAppointment, BookingError } from '@/lib/modules/booking'
import { PinError } from '@/lib/modules/patientAccess'
import { audit } from '@/lib/audit'
import { type NextRequest } from 'next/server'

// GET /api/appointments?mode=slots&date=YYYY-MM-DD — public: which slots are
// open on a clinic-local date. Returns no patient data.
export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)

    const date = request.nextUrl.searchParams.get('date')
    if (request.nextUrl.searchParams.get('mode') !== 'slots' || !date || !isValidYmd(date)) {
      return Response.json({ error: 'Invalid query parameters' }, { status: 400 })
    }

    const snap = await db.profile().get()
    if (!snap.exists) return Response.json({ error: 'Clinic not configured' }, { status: 503 })
    const doctor = { id: snap.id, ...snap.data() } as any

    const availability = await getDayAvailability(tenant, db, doctor, date)
    return Response.json({
      ...availability,
      timezone: tenant.timezone,
      today: ymdInTz(new Date(), tenant.timezone),
    })
  } catch (error) {
    console.error('[appointments-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/appointments — book an appointment.
//  - Clinic staff (signed in) book on a patient's behalf: no PIN, and the patient
//    gets the usual confirmation and reminders. They may pass a patientId.
//  - Patients book for themselves with their details plus a 4-digit PIN (chosen the
//    first time, required afterwards). Responses never include existing patient data.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })

    const parsed = await parseBody(request, bookingSchema)
    if ('error' in parsed) return parsed.error

    const session = await getSession()
    const isStaff = !!session && can(session.role, 'appointments:manage')
    const result = await bookAppointment(
      tenant,
      parsed.data,
      isStaff
        ? { kind: 'staff', uid: session!.uid }
        : { kind: 'public', ip: clientIp(request), session: await getPatientSession(tenant) },
    )

    if (isStaff) await audit(tenant, session!, 'appointment.book', `appointments/${result.appointment.id}`)
    // The patient just proved their PIN, so let them view/cancel for a while without re-entering it.
    if (result.pinSession) await startPatientSession(tenant, result.pinSession.phone, result.pinSession.pinVersion)

    const { pinSession: _omit, ...body } = result
    return Response.json(body, { status: 201 })
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status })
    if (error instanceof PinError) return Response.json({ error: error.message, code: error.code, retryAfter: error.retryAfterSec }, { status: error.status })
    console.error('[appointments-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
