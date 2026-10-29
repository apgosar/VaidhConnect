/**
 * Remove the phone-number-only Firebase Auth accounts created by the
 * unverified sign-in route (/api/patient/otp/bypass), which made one account for
 * every phone number anyone typed into the booking page. Those accounts hold
 * phone numbers of people who never signed up for anything.
 *
 *   npx tsx --env-file=.env scripts/cleanup-phone-accounts.ts                      # dry run
 *   npx tsx --env-file=.env scripts/cleanup-phone-accounts.ts --confirm <count>    # delete
 *   ... add --otp-codes to also delete leftover docs in the old `otp_codes` collection
 *
 * An account is removed ONLY if ALL of these hold:
 *   - it has a phone number and NO email (clinic staff, owners and operators sign in by email)
 *   - it carries no clinic/role/operator claims
 *   - it has no password or other sign-in provider besides "phone"
 *
 * Safety rails: dry run by default; the delete needs --confirm with the exact
 * number the dry run printed (so a changed database can't surprise you); phone
 * numbers are masked in all output. Nothing in Firestore is touched except the
 * optional otp_codes cleanup. Run against the right project: check the first
 * line of output.
 */
import type { UserRecord } from 'firebase-admin/auth'
import { auth, db, arg, flag } from './_admin'

const mask = (p?: string) => (p ? `${p.slice(0, 3)}${'*'.repeat(Math.max(0, p.length - 6))}${p.slice(-3)}` : '')

function isStrayPhoneAccount(u: UserRecord): boolean {
  if (!u.phoneNumber || u.email) return false
  const claims = (u.customClaims ?? {}) as Record<string, unknown>
  if (claims.clinicId || claims.role || claims.platformAdmin) return false
  // Only plain phone identities; anything else (password, Google, ...) is a real account.
  return u.providerData.every(p => p.providerId === 'phone')
}

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`)

  const stray: UserRecord[] = []
  let total = 0, token: string | undefined
  do {
    const page = await auth.listUsers(1000, token)
    total += page.users.length
    stray.push(...page.users.filter(isStrayPhoneAccount))
    token = page.pageToken
  } while (token)

  const created = stray.map(u => new Date(u.metadata.creationTime).getTime()).sort((a, b) => a - b)
  console.log(`Scanned ${total} accounts; ${stray.length} are phone-number-only accounts with no email or role.`)
  if (stray.length) {
    console.log(`  first created: ${new Date(created[0]).toISOString()}   last: ${new Date(created[created.length - 1]).toISOString()}`)
    const recent = stray.filter(u => u.metadata.lastSignInTime).length
    console.log(`  ${recent} have ever signed in; sample:`, stray.slice(0, 5).map(u => mask(u.phoneNumber)).join(', '))
  }

  let otpCount = 0
  if (flag('otp-codes')) {
    otpCount = (await db.collection('otp_codes').count().get()).data().count
    console.log(`  otp_codes documents (old verification codes): ${otpCount}`)
  }

  const confirm = arg('confirm')
  if (confirm === undefined) {
    console.log(`\nDry run only. To delete these ${stray.length} accounts: add  --confirm ${stray.length}`)
    return
  }
  if (Number(confirm) !== stray.length) {
    throw new Error(`--confirm ${confirm} does not match the ${stray.length} accounts found now. Re-run the dry run and use its number.`)
  }

  let deleted = 0
  for (let i = 0; i < stray.length; i += 1000) {
    const batch = stray.slice(i, i + 1000).map(u => u.uid)
    const r = await auth.deleteUsers(batch)
    deleted += r.successCount
    if (r.failureCount) console.warn(`  ${r.failureCount} failed in this batch:`, r.errors.slice(0, 3).map(e => e.error.message))
  }
  console.log(`Deleted ${deleted} accounts.`)

  if (flag('otp-codes') && otpCount) {
    await db.recursiveDelete(db.collection('otp_codes'))
    console.log(`Deleted ${otpCount} otp_codes documents.`)
  }
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
