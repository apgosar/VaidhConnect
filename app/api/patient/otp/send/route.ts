import { adminDb } from '@/lib/firebase/server'
import { sendOtpCode } from '@/lib/whatsapp'
import crypto from 'crypto'

const CODE_TTL_MS = 10 * 60 * 1000       // code valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000     // 1 minute between sends
const MAX_SENDS_PER_WINDOW = 5           // per phone, per rolling hour
const SEND_WINDOW_MS = 60 * 60 * 1000

// POST /api/patient/otp/send — { phone } — generates a code, stores its
// hash, and delivers it via WhatsApp. Public by design (this IS the start
// of the identity-verification flow), so every limit here is load-bearing:
// it's the only thing standing between this endpoint and being a free
// WhatsApp-message cannon pointed at arbitrary phone numbers.
export async function POST(request: Request) {
  try {
    const { phone } = await request.json()
    if (!phone) {
      return Response.json({ error: 'Phone number required' }, { status: 400 })
    }

    const normalized = String(phone).replace(/[\s\-()]/g, '')
    if (!/^\+91\d{10}$/.test(normalized)) {
      return Response.json({ error: 'Please enter a valid Indian mobile number' }, { status: 400 })
    }

    const otpRef = adminDb.collection('otp_codes').doc(normalized)
    const otpDoc = await otpRef.get()
    const now = new Date()

    let sendCount = 0
    let windowStart = now

    if (otpDoc.exists) {
      const data = otpDoc.data() as any
      const existingWindowStart: Date = data.windowStart?.toDate() ?? now
      const withinWindow = now.getTime() - existingWindowStart.getTime() < SEND_WINDOW_MS

      if (withinWindow) {
        sendCount = data.sendCount ?? 0
        windowStart = existingWindowStart

        if (sendCount >= MAX_SENDS_PER_WINDOW) {
          return Response.json({ error: 'Too many verification codes requested. Please try again later.' }, { status: 429 })
        }

        const lastSentAt: Date | undefined = data.createdAt?.toDate()
        if (lastSentAt && now.getTime() - lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
          return Response.json({ error: 'Please wait a minute before requesting another code.' }, { status: 429 })
        }
      }
    }

    const code = crypto.randomInt(100000, 1000000).toString()
    const codeHash = crypto.createHash('sha256').update(`${code}:${normalized}`).digest('hex')

    await otpRef.set({
      codeHash,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      sendCount: sendCount + 1,
      windowStart,
      createdAt: now,
    })

    const sent = await sendOtpCode(normalized, { code })
    if (!sent) {
      return Response.json({ error: 'Failed to send verification code. Please try again.' }, { status: 502 })
    }

    return Response.json({ status: 'sent' })
  } catch (error) {
    console.error('[patient-otp-send]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
