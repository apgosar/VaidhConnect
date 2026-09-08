import { adminDb, adminAuth } from '@/lib/firebase/server'
import crypto from 'crypto'

const MAX_VERIFY_ATTEMPTS = 5

// POST /api/patient/otp/verify — { phone, code } — checks the code against
// its stored hash and, on success, mints a Firebase custom token for a
// user record keyed by that phone number. The client exchanges this for
// an ID token (signInWithCustomToken) and POSTs it to /api/patient/session
// to establish the actual session cookie — this endpoint never sets a
// session itself, only proves phone ownership.
export async function POST(request: Request) {
  try {
    const { phone, code } = await request.json()
    if (!phone || !code) {
      return Response.json({ error: 'Phone and code are required' }, { status: 400 })
    }

    const normalized = String(phone).replace(/[\s\-()]/g, '')
    const otpRef = adminDb.collection('otp_codes').doc(normalized)
    const otpDoc = await otpRef.get()

    if (!otpDoc.exists) {
      return Response.json({ error: 'No verification code found. Please request a new one.' }, { status: 400 })
    }

    const data = otpDoc.data() as any
    const now = new Date()

    if (data.expiresAt?.toDate() < now) {
      await otpRef.delete()
      return Response.json({ error: 'Verification code expired. Please request a new one.' }, { status: 400 })
    }

    if ((data.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
      await otpRef.delete()
      return Response.json({ error: 'Too many incorrect attempts. Please request a new code.' }, { status: 429 })
    }

    const codeHash = crypto.createHash('sha256').update(`${code}:${normalized}`).digest('hex')
    if (codeHash !== data.codeHash) {
      await otpRef.update({ attempts: (data.attempts ?? 0) + 1 })
      return Response.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
    }

    // Correct code — consume it immediately so it can't be replayed.
    await otpRef.delete()

    let userRecord
    try {
      userRecord = await adminAuth.getUserByPhoneNumber(normalized)
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        userRecord = await adminAuth.createUser({ phoneNumber: normalized })
      } else {
        throw err
      }
    }

    const customToken = await adminAuth.createCustomToken(userRecord.uid)
    return Response.json({ customToken })
  } catch (error) {
    console.error('[patient-otp-verify]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
