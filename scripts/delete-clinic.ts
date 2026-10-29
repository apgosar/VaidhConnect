/**
 * Permanently delete a clinic and everything it owns: its Firestore data,
 * uploaded files, staff logins and hostname mappings. For when a clinic leaves
 * (and as the "right to erasure" path).
 *
 *   npx tsx --env-file=.env scripts/delete-clinic.ts --clinic drshah               # dry run: shows what would go
 *   npx tsx --env-file=.env scripts/delete-clinic.ts --clinic drshah --confirm drshah   # actually deletes
 *
 * Safety rails: scoped clinics only; the clinic must already be suspended; the
 * --confirm value must repeat the clinic id. EXPORT FIRST (export-clinic.ts) —
 * this cannot be undone.
 */
import { auth, db, bucket, arg } from './_admin'

async function main() {
  const clinicId = arg('clinic')
  if (!clinicId) throw new Error('Required: --clinic <id>')

  const ref = db.collection('clinics').doc(clinicId)
  const profile = await ref.get()
  if (!profile.exists) throw new Error(`No scoped clinic "${clinicId}". Legacy clinics are not deletable with this tool.`)
  if ((profile.data() as any).status !== 'suspended') throw new Error('Suspend the clinic first (operator console), then re-run.')

  const collections = await ref.listCollections()
  const counts: Record<string, number> = {}
  for (const c of collections) counts[c.id] = (await c.count().get()).data().count

  const users = await ref.collection('users').get()
  const uids = new Set<string>(users.docs.map(d => d.id))
  const ownerUid = (profile.data() as any).ownerUid
  if (ownerUid) uids.add(ownerUid)

  const domains = await db.collection('domains').where('clinicId', '==', clinicId).get()
  const [files] = await bucket().getFiles({ prefix: `clinics/${clinicId}/` })

  console.log(`Clinic "${clinicId}" (${(profile.data() as any).clinicName})`)
  console.log('  documents:', JSON.stringify(counts))
  console.log(`  logins: ${uids.size}   hostnames: ${domains.size}   files: ${files.length}`)

  if (arg('confirm') !== clinicId) {
    console.log('\nDry run only. To delete for real: add  --confirm ' + clinicId)
    return
  }

  await db.recursiveDelete(ref)
  for (const d of domains.docs) await d.ref.delete()
  await Promise.all(files.map(f => f.delete()))
  for (const uid of uids) await auth.deleteUser(uid).catch(e => console.warn(`could not delete login ${uid}: ${e.message}`))
  console.log('Deleted.')
}
main().catch(e => { console.error(e.message ?? e); process.exit(1) })
