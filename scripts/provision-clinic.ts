/**
 * Onboard a new clinic from the command line. Same logic as the operator
 * console (lib/modules/provisioning.ts); no code change or deploy needed.
 *
 *   npx tsx --env-file=.env scripts/provision-clinic.ts \
 *     --id drshah --name "Shah Clinic" --doctor "Abhay Shah" \
 *     --email owner@example.com --domain drshah.example.in \
 *     [--timezone Asia/Kolkata] [--specialty "General Physician"] [--primary "#0F3D2E"]
 *
 * The owner gets a one-time password-reset link (printed once). No password is
 * ever generated or stored by this script.
 */
import { auth, db, arg } from './_admin'
import { provisionClinic } from '../lib/modules/provisioning'

async function main() {
  const id = arg('id'), name = arg('name'), doctor = arg('doctor')
  const email = arg('email'), domain = arg('domain')
  if (!id || !name || !doctor || !email || !domain) throw new Error('Required: --id --name --doctor --email --domain')

  const r = await provisionClinic({ auth, db }, {
    id, name, doctor, email, domain,
    timezone: arg('timezone'), specialty: arg('specialty'), primary: arg('primary'),
  })
  console.log(`Clinic "${r.clinicId}" created and mapped to ${r.domain}.`)
  console.log(`Send the owner this one-time link to set their password:\n${r.passwordResetLink}`)
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
