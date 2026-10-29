import { parseBody } from '@/lib/validation'
import { resetConfirmBody, pinFail, pinPreamble } from '@/lib/pinHttp'
import { confirmPinReset } from '@/lib/modules/patientAccess'
import { startPatientSession } from '@/lib/auth/patientPin'

// POST /api/patient/pin/reset/confirm — { phone, code, pin }
// Checks the WhatsApp code, sets the new PIN (verified, because the code proves
// ownership), ends every older session, and signs this device in.
export async function POST(request: Request) {
  try {
    const pre = await pinPreamble(request, 'pinresetconf', 30)
    if ('error' in pre) return pre.error
    const parsed = await parseBody(request, resetConfirmBody)
    if ('error' in parsed) return parsed.error

    const r = await confirmPinReset(pre.db, parsed.data.phone, parsed.data.code, parsed.data.pin)
    await startPatientSession(pre.tenant, parsed.data.phone, r.pinVersion)
    return Response.json({ ok: true })
  } catch (e) {
    const r = pinFail(e); if (r) return r
    console.error('[pin-reset-confirm]', e)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
