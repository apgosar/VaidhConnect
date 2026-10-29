import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/access'
import { bookingSchema, parseBody } from '@/lib/validation'
import { clientIp } from '@/lib/ratelimit'
import { isValidYmd, ymdInTz } from '@/lib/time'
import { getDayAvailability } from '@/lib/modules/availability'
import { bookAppointment, BookingError } from '@/lib/modules/booking'
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
// Public callers send patient details; staff (signed-in clinic users) may
// instead pass an existing patientId. Public responses never include any
// existing patient data.
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
      isStaff ? { kind: 'staff', uid: session!.uid } : { kind: 'public', ip: clientIp(request) },
    )

    if (isStaff) await audit(tenant, session!, 'appointment.book', `appointments/${result.appointment.id}`)
    return Response.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status })
    console.error('[appointments-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
