/**
 * Build a clinic's medicine suggestions from the prescriptions it has already written, so the
 * prescription form suggests them from day one. New prescriptions add to the list on their own.
 *
 *   npx tsx --env-file=.env scripts/backfill-medicine-catalog.ts --clinic <clinicId>             # dry run
 *   npx tsx --env-file=.env scripts/backfill-medicine-catalog.ts --clinic <clinicId> --execute   # write
 *
 * Reads clinics/<id>/prescriptions (the scoped layout every clinic uses after the migration).
 * Safe to run twice: use counts are rebuilt from the prescriptions each time, not added on top.
 */
import { db, arg, flag } from './_admin'
import { rememberMedicines, normalizeName } from '../lib/modules/medicineCatalog'

async function main() {
  const clinicId = arg('clinic')
  if (!clinicId) throw new Error('Required: --clinic <clinicId>')
  const execute = flag('execute')
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}  clinic: ${clinicId}  ${execute ? 'EXECUTING' : 'DRY RUN (add --execute to write)'}`)

  const base = db.collection('clinics').doc(clinicId)
  const prescriptions = (await base.collection('prescriptions').get()).docs
    .map(d => d.data() as any)
    .sort((a, b) => (a.updatedAt?.toMillis?.() ?? 0) - (b.updatedAt?.toMillis?.() ?? 0))

  const distinct = new Set<string>()
  for (const rx of prescriptions) for (const m of rx.medicines ?? []) if (normalizeName(m.name ?? '')) distinct.add(normalizeName(m.name))
  console.log(`${prescriptions.length} prescriptions, ${distinct.size} distinct medicines`)
  if (!execute) return

  // Start from a clean list so a second run cannot double the counts.
  const existing = await base.collection('medicine_catalog').get()
  await Promise.all(existing.docs.map(d => d.ref.delete()))

  const tenantLike = { col: (name: string) => base.collection(name) } as any
  for (const rx of prescriptions) await rememberMedicines(tenantLike, rx.medicines ?? [], [], rx.updatedAt?.toDate?.() ?? new Date())
  console.log(`Wrote ${distinct.size} medicines.`)
}

main().catch(e => { console.error(e); process.exit(1) })
