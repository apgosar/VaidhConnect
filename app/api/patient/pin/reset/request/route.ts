import { parseBody } from '@/lib/validation'
import { phoneBody, pinFail, pinPreamble } from '@/lib/pinHttp'
import { requestPinReset } from '@/lib/modules/patientAccess'
import { apiError } from '@/lib/errors'

// POST /api/patient/pin/reset/request — { phone }
// Sends a one-time code to that number's own WhatsApp. Whoever receives it owns
// the number, which is why setting a PIN with it makes the PIN "verified".
export async function POST(request: Request) {
  try {
    const pre = await pinPreamble(request, 'pinresetreq', 20)
    if ('error' in pre) return pre.error
    const parsed = await parseBody(request, phoneBody)
    if ('error' in parsed) return parsed.error

    await requestPinReset(pre.tenant, parsed.data.phone, pre.ip)
    return Response.json({ ok: true })
  } catch (e) {
    const r = pinFail(e); if (r) return r
    console.error('[pin-reset-request]', e)
    return apiError('SERVER_ERROR')
  }
}
