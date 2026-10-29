import { z } from 'zod'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody, phoneSchema } from '@/lib/validation'
import { pinFail } from '@/lib/pinHttp'
import { staffResetPin, staffSetPin } from '@/lib/modules/patientAccess'
import { audit } from '@/lib/audit'
import { apiError } from '@/lib/errors'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reset'), phone: phoneSchema }),
  z.object({ action: z.literal('set'), phone: phoneSchema, pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits') }),
])

// POST — clinic staff manage a patient's PIN.
//   reset: "I forgot my PIN" over the phone. Clears it and signs the patient out
//          everywhere; they choose a new one on their next booking.
//   set:   with the patient at the desk. Ownership was checked in person, so this
//          PIN is VERIFIED and lets the patient see every appointment on that number.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'patients:manage')
    if (denied) return denied

    const parsed = await parseBody(request, schema)
    if ('error' in parsed) return parsed.error
    const db = tenantDb(tenant)

    if (parsed.data.action === 'reset') await staffResetPin(db, parsed.data.phone)
    else await staffSetPin(db, parsed.data.phone, parsed.data.pin)

    // Never record the PIN itself — only that, and for which number, it changed.
    await audit(tenant, session, `patient-pin.${parsed.data.action}`, `phones/${parsed.data.phone.slice(0, 5)}*****${parsed.data.phone.slice(-2)}`)
    return Response.json({ ok: true })
  } catch (e) {
    const r = pinFail(e); if (r) return r
    console.error('[patient-pin-staff]', e)
    return apiError('SERVER_ERROR')
  }
}
