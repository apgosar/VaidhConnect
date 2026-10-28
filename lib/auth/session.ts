import { cookies } from 'next/headers';
import { adminAuth } from '../firebase/server';
import { getTenant } from '../tenant/resolve';
import { tenantDb } from '../db/tenant';

export async function createSessionCookie(idToken: string) {
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    const cookieStore = await cookies();
    cookieStore.set('session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });
    return true;
  } catch (error) {
    console.error('Failed to create session cookie', error);
    return false;
  }
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

/**
 * Verifies the session cookie AND that the uid corresponds to a real doctor
 * record. A Firebase Auth user with a valid cookie but no `doctors` document
 * (e.g. a self-registered account, if sign-up is ever left open) is treated
 * as unauthenticated everywhere this is called.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return null;

  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    // A session is only valid on the clinic it belongs to. Clinics provisioned
    // with a clinicId claim must match the host's tenant exactly; legacy
    // single-clinic accounts are identified by uid === clinicId.
    const tenant = await getTenant();
    if (!tenant) return null;
    const claimedClinic = (decodedClaims as any).clinicId as string | undefined;
    const belongs = claimedClinic ? claimedClinic === tenant.clinicId : decodedClaims.uid === tenant.clinicId;
    if (!belongs) return null;
    const profile = await tenantDb(tenant).profile().get();
    if (!profile.exists) return null;
    return decodedClaims;
  } catch (error) {
    return null;
  }
}
