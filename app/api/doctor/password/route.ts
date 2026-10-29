import { z } from 'zod'
import { adminAuth } from '@/lib/firebase/server'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession, clearSessionCookie } from '@/lib/auth/session'
import { parseBody } from '@/lib/validation'
import { rateLimit } from '@/lib/ratelimit'
import { audit } from '@/lib/audit'

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'Password must be at least 10 characters').max(200),
})

// POST — change your own password. Unlike a session cookie alone (which could
// be stolen), this requires the CURRENT password, and afterwards every
// existing session for the user is revoked so a thief is signed out too.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const session = await getSession()
    if (!session?.uid || !session.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = await parseBody(request, schema)
    if ('error' in parsed) return parsed.error
    const { currentPassword, newPassword } = parsed.data

    // Slow down guessing of the current password.
    if (!(await rateLimit(tenantDb(tenant), `pw:${session.uid}`, 5, 15 * 60))) {
      return Response.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 })
    }

    const verify = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: session.email, password: currentPassword, returnSecureToken: false }),
      },
    )
    if (!verify.ok) return Response.json({ error: 'Current password is incorrect' }, { status: 400 })

    await adminAuth.updateUser(session.uid, { password: newPassword })
    await adminAuth.revokeRefreshTokens(session.uid)
    await audit(tenant, session, 'user.password-change', `users/${session.uid}`)
    await clearSessionCookie()

    return Response.json({ ok: true, signedOut: true })
  } catch (error) {
    console.error('[password-change]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
