/**
 * Grant or revoke the platform-operator role (access to /admin).
 *
 *   npx tsx --env-file=.env scripts/make-platform-admin.ts --email you@example.com
 *   npx tsx --env-file=.env scripts/make-platform-admin.ts --email you@example.com --revoke
 *
 * The account must already exist in Firebase Auth. The user must sign in again
 * for the change to take effect.
 */
import { auth, arg, flag } from './_admin'

async function main() {
  const email = arg('email')
  if (!email) throw new Error('Required: --email')
  const user = await auth.getUserByEmail(email)
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>
  if (flag('revoke')) delete claims.platformAdmin
  else claims.platformAdmin = true
  await auth.setCustomUserClaims(user.uid, claims)
  await auth.revokeRefreshTokens(user.uid)
  console.log(`${flag('revoke') ? 'Revoked' : 'Granted'} platform admin for ${email}`)
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
