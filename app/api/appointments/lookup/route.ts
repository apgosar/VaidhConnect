import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { lookupSchema, parseBody } from '@/lib/validation'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { lookupAppointments } from '@/lib/modules/booking'

// POST /api/appointments/lookup — { items: [{ id, token }] }
// "My appointments" for a patient who booked on this device. Each appointment
// is returned only if its secret token (issued once at booking and kept on the
// patient's device) matches, so nothing can be enumerated by phone or name.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })

    if (!(await rateLimit(tenantDb(tenant), `lookup:ip:${clientIp(request)}`, 60, 3600))) {
      return Response.json({ error: 'Too many requests' }, { status: 429 })
    }

    const parsed = await parseBody(request, lookupSchema)
    if ('error' in parsed) return parsed.error

    return Response.json({ appointments: await lookupAppointments(tenant, parsed.data.items) })
  } catch (error) {
    console.error('[appointments-lookup]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
