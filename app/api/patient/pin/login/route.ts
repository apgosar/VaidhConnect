import { parseBody } from '@/lib/validation'
import { loginBody, pinFail, pinPreamble } from '@/lib/pinHttp'
import { verifyPin } from '@/lib/modules/patientAccess'
import { startPatientSession, endPatientSession } from '@/lib/auth/patientPin'
import { apiError } from '@/lib/errors'

// POST /api/patient/pin/login — { phone, pin } — starts a 30-minute session.
// Wrong guesses are counted per phone number with escalating lockouts, on top of
// a per-IP budget here.
export async function POST(request: Request) {
  try {
    const pre = await pinPreamble(request, 'pinlogin', 60)
    if ('error' in pre) return pre.error
    const parsed = await parseBody(request, loginBody)
    if ('error' in parsed) return parsed.error

    const v = await verifyPin(pre.db, parsed.data.phone, parsed.data.pin)
    await startPatientSession(pre.tenant, parsed.data.phone, v.pinVersion)
    return Response.json({ ok: true, verified: v.verified })
  } catch (e) {
    const r = pinFail(e); if (r) return r
    console.error('[pin-login]', e)
    return apiError('SERVER_ERROR')
  }
}

// DELETE — sign out
export async function DELETE() {
  await endPatientSession()
  return Response.json({ ok: true })
}
