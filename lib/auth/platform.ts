import { cookies, headers } from 'next/headers'
import { adminAuth } from '../firebase/server'

const COOKIE = 'admin_session'
const EXPIRES_IN_MS = 8 * 60 * 60 * 1000 // operators re-authenticate daily

/**
 * The operator console is only served on hosts listed in PLATFORM_ADMIN_HOSTS
 * (comma-separated). If the variable is unset the console does not exist, so a
 * clinic's public hostname can never expose it.
 */
export async function adminHostAllowed(): Promise<boolean> {
  const allowed = (process.env.PLATFORM_ADMIN_HOSTS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (allowed.length === 0) return false
  const h = await headers()
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').toLowerCase().split(':')[0]
  return allowed.includes(host)
}

/** Exchange a Firebase ID token for an operator session — only if it carries the platformAdmin claim. */
export async function createAdminSession(idToken: string): Promise<boolean> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    if (decoded.platformAdmin !== true) return false
    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN_MS })
    ;(await cookies()).set(COOKIE, cookie, {
      maxAge: EXPIRES_IN_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'strict',
    })
    return true
  } catch {
    return false
  }
}

export async function clearAdminSession() {
  ;(await cookies()).delete(COOKIE)
}

/** The signed-in operator, or null. Re-checks the claim and revocation on every request. */
export async function getPlatformAdmin() {
  if (!(await adminHostAllowed())) return null
  const cookie = (await cookies()).get(COOKIE)?.value
  if (!cookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true)
    return decoded.platformAdmin === true ? decoded : null
  } catch {
    return null
  }
}
