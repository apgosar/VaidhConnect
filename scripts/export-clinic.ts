/**
 * Export everything a clinic owns, for data portability, offboarding, or a
 * backup before deletion. Read-only: changes nothing.
 *
 *   npx tsx --env-file=.env scripts/export-clinic.ts --clinic drshah --out ./exports/drshah
 *   ... --files     also download the clinic's uploaded files (prescriptions, receipts, logos)
 *
 * Writes one JSON file per collection plus profile.json. Timestamps become
 * ISO-8601 strings. Works on clinics in the scoped layout (clinics/{id}/...).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DocumentReference } from 'firebase-admin/firestore'
import { db, bucket, arg, flag } from './_admin'

const plain = (v: any): any => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString()
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  return v
}

async function main() {
  const clinicId = arg('clinic'), out = arg('out')
  if (!clinicId || !out) throw new Error('Required: --clinic <id> --out <directory>')

  const ref = db.collection('clinics').doc(clinicId)
  const profile = await ref.get()
  if (!profile.exists) throw new Error(`No scoped clinic "${clinicId}" (legacy clinics must be migrated first)`)

  mkdirSync(out, { recursive: true })
  const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 2))
  write('profile.json', plain({ id: clinicId, ...profile.data() }))

  const collections = await (ref as DocumentReference).listCollections()
  for (const c of collections) {
    const snap = await c.get()
    write(`${c.id}.json`, snap.docs.map(d => plain({ id: d.id, ...d.data() })))
    console.log(`${c.id}: ${snap.size} documents`)
  }

  const [files] = await bucket().getFiles({ prefix: `clinics/${clinicId}/` })
  write('files.json', files.map(f => ({ path: f.name, bytes: Number(f.metadata.size) })))
  console.log(`files: ${files.length}`)
  if (flag('files')) {
    for (const f of files) {
      const dest = join(out, 'files', f.name.replace(`clinics/${clinicId}/`, ''))
      mkdirSync(dirname(dest), { recursive: true })
      await f.download({ destination: dest })
    }
    console.log(`downloaded ${files.length} files`)
  }
  console.log(`Export written to ${out}`)
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
