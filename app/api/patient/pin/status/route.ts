import { parseBody } from '@/lib/validation'
import { phoneBody, pinFail, pinPreamble } from '@/lib/pinHttp'
import { hasPin } from '@/lib/modules/patientAccess'

// POST /api/patient/pin/status — { phone } -> { hasPin }
// Lets the booking page word its prompt ("Enter your PIN" vs "Choose a PIN").
// Reveals only whether a PIN exists for a number, and is rate-limited per IP.
export async function POST(request: Request) {
  try {
    const pre = await pinPreamble(request, 'pinstatus', 40)
    if ('error' in pre) return pre.error
    const parsed = await parseBody(request, phoneBody)
    if ('error' in parsed) return parsed.error
    return Response.json({ hasPin: await hasPin(pre.db, parsed.data.phone) })
  } catch (e) {
    const r = pinFail(e); if (r) return r
    console.error('[pin-status]', e)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
