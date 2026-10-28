/**
 * Onboard a new clinic. Creates the clinic profile, its owner login (with a
 * clinicId claim) and the host -> clinic mapping. No code change or deploy.
 *
 *   npx tsx --env-file=.env scripts/provision-clinic.ts \
 *     --id drshah --name "Shah Clinic" --doctor "Abhay Shah" \
 *     --email owner@example.com --domain drshah.example.in \
 *     [--timezone Asia/Kolkata] [--specialty "General Physician"] [--primary "#0F3D2E"]
 *
 * The owner gets a password-reset link (printed once) — no password is ever
 * generated or stored by this script.
 */
import { auth, db, arg } from './_admin'
import { DEFAULT_TIMINGS } from '../lib/constants'

async function main() {
  const id = arg('id'), name = arg('name'), doctor = arg('doctor')
  const email = arg('email'), domain = arg('domain')?.toLowerCase()
  if (!id || !name || !doctor || !email || !domain) {
    throw new Error('Required: --id --name --doctor --email --domain')
  }
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new Error('--id must be lowercase letters, digits, dashes')

  const clinicRef = db.collection('clinics').doc(id)
  if ((await clinicRef.get()).exists) throw new Error(`Clinic "${id}" already exists`)
  if ((await db.collection('domains').doc(domain).get()).exists) throw new Error(`Domain "${domain}" is already mapped`)

  const user = await auth.createUser({ email, displayName: `Dr. ${doctor}` })
  await auth.setCustomUserClaims(user.uid, { clinicId: id, role: 'OWNER' })

  const primary = arg('primary')
  await clinicRef.set({
    clinicName: name,
    name: doctor,
    email,
    specialty: arg('specialty') ?? 'General Physician',
    slotDurationMins: 15,
    timings: DEFAULT_TIMINGS,
    reminderIntervals: [24, 1],
    timezone: arg('timezone') ?? 'Asia/Kolkata',
    registrationNumber: 'Reg. No: Pending',
    youtubeLinks: [],
    products: [],
    pageViews: 0,
    features: {},                       // all on by default; operator-editable
    ...(primary ? { theme: { primary } } : {}),
    ownerUid: user.uid,
    createdAt: new Date(),
  })
  await clinicRef.collection('users').doc(user.uid).set({ email, role: 'OWNER', createdAt: new Date() })
  await db.collection('domains').doc(domain).set({
    clinicId: id, storage: 'scoped', timezone: arg('timezone') ?? 'Asia/Kolkata',
  })

  const link = await auth.generatePasswordResetLink(email)
  console.log(`Clinic "${id}" created and mapped to ${domain}.`)
  console.log(`Send the owner this one-time link to set their password:\n${link}`)
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
