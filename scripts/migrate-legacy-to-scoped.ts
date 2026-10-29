/**
 * Copy a legacy single-clinic dataset (root collections) into the scoped
 * layout clinics/{clinicId}/... — COPY ONLY: nothing is deleted or modified in
 * the source, so it can be re-run and the old data remains the rollback.
 *
 *   npx tsx --env-file=.env scripts/migrate-legacy-to-scoped.ts \
 *     --clinic <doctorUid> --domain <host>            # dry run (default)
 *   ... --execute                                      # actually copy
 *
 * Cutover (separate, deliberate step): flip domains/{host}.storage to 'scoped'.
 * Writes made to the legacy collections after the copy are NOT carried over,
 * so re-run with --execute immediately before flipping, during a quiet window.
 */
import { db, arg, flag } from './_admin'

// Everything the app keeps per clinic (see COLLECTIONS in lib/tenant/types.ts) except rate_limits,
// which are short-lived counters. Missing patient_access would silently reset every patient's PIN;
// missing slot_locks would drop the double-booking guard on already-booked slots.
const COLLECTIONS = ['patients', 'appointments', 'prescriptions', 'payments', 'blocked_slots', 'whatsapp_logs', 'slot_locks', 'audit_logs', 'users', 'patient_access']

async function main() {
  const clinicId = arg('clinic'), domain = arg('domain')?.toLowerCase()
  const execute = flag('execute')
  if (!clinicId || !domain) throw new Error('Required: --clinic <doctorUid> --domain <host>')

  const legacy = await db.collection('doctors').doc(clinicId).get()
  if (!legacy.exists) throw new Error(`No legacy doctor ${clinicId}`)

  console.log(execute ? 'EXECUTING copy' : 'DRY RUN (add --execute to copy)')
  const target = db.collection('clinics').doc(clinicId)
  if (execute) await target.set(legacy.data()!, { merge: true })

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get()
    console.log(`${name}: ${snap.size} docs`)
    if (!execute) continue
    let batch = db.batch(), n = 0
    for (const d of snap.docs) {
      batch.set(target.collection(name).doc(d.id), d.data())
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
    await batch.commit()
    const copied = (await target.collection(name).count().get()).data().count
    console.log(`  verified in target: ${copied}`)
    if (copied < snap.size) throw new Error(`${name}: target has fewer docs than source`)
  }

  if (execute) {
    // Map the host to the scoped copy but leave it on legacy until cutover.
    await db.collection('domains').doc(domain).set({ clinicId, storage: 'legacy', timezone: 'Asia/Kolkata' }, { merge: true })
    console.log(`Copy complete. domains/${domain} still points at legacy storage.`)
    console.log(`To cut over: set domains/${domain}.storage = "scoped" (after a final re-run).`)
  }
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
