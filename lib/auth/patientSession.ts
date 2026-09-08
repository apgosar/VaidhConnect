import { cookies } from 'next/headers';
import { adminAuth } from '../firebase/server';

const COOKIE_NAME = 'patient_session';
const EXPIRES_IN_MS = 60 * 60 * 24 * 5 * 1000; // 5 days, matches the doctor session

/**
 * Creates a patient session cookie from a Firebase ID token. Refuses to do
 * so unless the token actually came from a phone-verified sign-in — a
 * patient session's entire purpose is to carry a VERIFIED phone number, so
 * an email/password token (e.g. a doctor's) is never a valid input here.
 */
export async function createPatientSessionCookie(idToken: string) {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.phone_number) {
      return false;
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN_MS });
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, sessionCookie, {
      maxAge: EXPIRES_IN_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });
    return true;
  } catch (error) {
    console.error('Failed to create patient session cookie', error);
    return false;
  }
}

export async function clearPatientSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Verifies the patient session cookie and returns the caller's own
 * VERIFIED phone number — the trust anchor for every patient-facing route.
 * Never trust a phone number supplied in a request body or query string;
 * always derive it from here instead.
 */
export async function getPatientSession(): Promise<{ uid: string; phoneNumber: string } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    if (!decoded.phone_number) return null;
    return { uid: decoded.uid, phoneNumber: decoded.phone_number };
  } catch {
    return null;
  }
}
