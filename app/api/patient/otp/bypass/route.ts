import { adminAuth } from '@/lib/firebase/server'

// POST /api/patient/otp/bypass — { phone } — TEMPORARY stand-in for
// /api/patient/otp/send + /api/patient/otp/verify while the WhatsApp
// `patient_otp_verification` template is unapproved in the Meta Business
// account (error 132001: "template name does not exist in the
// translation"), which made /otp/send fail outright and blocked booking
// entirely. Mints a Firebase custom token straight from the typed phone
// number, with NO proof that the caller actually owns it — this is a
// real trust regression, acceptable only as a short-term unblock.
//
// To restore real verification once the template is fixed: point
// PatientPortal.tsx's handleSendOtp back at /api/patient/otp/send (which
// re-adds the OTP entry screen and /api/patient/otp/verify call), and
// this route can be deleted. /otp/send and /otp/verify were left
// untouched for exactly this.
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
    console.error('[patient-otp-bypass]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
