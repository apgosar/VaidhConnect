/**
 * Rehearse the legacy -> scoped migration end to end on STAGING with synthetic
 * data: seed a fake single-clinic ("legacy") dataset, serve it through the app,
 * copy it, cut the hostname over using the maintenance sequence from
 * docs/ROLLOUT.md, prove the app works on the copy, roll back, clean up.
 *
 *   npx tsx --env-file=.env.staging scripts/rehearse-migration.ts --host <a tagged staging hostname>
 *
 * Refuses to run unless FIREBASE_PROJECT_ID contains "staging". Takes ~4 minutes
 * because it waits out the tenant cache between steps.
 */
import { spawnSync } from 'node:child_process'
import { auth, db, arg } from './_admin'

if (!(process.env.FIREBASE_PROJECT_ID ?? '').includes('staging')) { console.error('Refusing to run: not a staging project.'); process.exit(1) }
const host = arg('host')!
if (!host) throw new Error('Required: --host')
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string

const ID = 'zzlegacy'
const results: Array<[string, boolean]> = []
const check = (name: string, ok: boolean, extra = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const TENANT_CACHE_WAIT = 30_000 // longer than the 20s tenant cache, so every instance has noticed a change

async function api(path: string, init: any = {}) {
  const r = await fetch(`https://${host}${path}`, {
    method: init.method,
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.json ? { 'content-type': 'application/json' } : {}) },
    body: init.json ? JSON.stringify(init.json) : undefined,
  })
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, body, res: r }
}

async function ownerCookie(): Promise<string> {
  const token = await auth.createCustomToken(ID)
  const ex = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }),
  })).json() as any
  const r = await api('/api/auth/session', { method: 'POST', json: { idToken: ex.idToken } })
  const c = r.res.headers.getSetCookie().find(x => x.startsWith('session='))
  if (!c) throw new Error('could not sign in the synthetic owner')
  return c.split(';')[0]
}

async function waitFor(cond: () => Promise<boolean>, tries = 16) {
  for (let i = 0; i < tries; i++) { if (await cond()) return true; await sleep(6000) }
  return false
}

const migrate = (...extra: string[]) => {
  const r = spawnSync('npx', ['tsx', '--env-file=.env.staging', 'scripts/migrate-legacy-to-scoped.ts', '--clinic', ID, '--domain', host, ...extra], { encoding: 'utf8', shell: true })
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), code: r.status }
}

const future = (h: number) => new Date(Date.now() + h * 3_600_000)
const ymd = (base: string, n: number) => new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10) + n)).toISOString().slice(0, 10)

/** Remove everything this rehearsal can create, including strays from an aborted earlier run. */
async function sweep() {
  const del = (s: FirebaseFirestore.QuerySnapshot) => Promise.all(s.docs.map(d => d.ref.delete()))
  await del(await db.collection('appointments').where('doctorId', '==', ID).get())
  await del(await db.collection('patients').where('name', '>=', 'ZZ ').where('name', '<=', 'ZZ~').get())
  await del(await db.collection('whatsapp_logs').where('recipientName', '>=', 'ZZ ').where('recipientName', '<=', 'ZZ~').get())
  await db.collection('blocked_slots').doc('zzblock').delete().catch(() => {})
  await db.collection('whatsapp_logs').doc('zzlog').delete().catch(() => {})
}

async function main() {
  await sweep() // start from a known-clean state
  const cleanup: Array<() => Promise<unknown>> = []
  const root = (c: string) => db.collection(c)
  const scoped = (c: string) => db.collection('clinics').doc(ID).collection(c).get()
  try {
    // ── seed a fake legacy clinic ────────────────────────────────────────
    await auth.createUser({ uid: ID, email: 'zz-legacy@example.invalid' }).catch(() => {})
    await root('doctors').doc(ID).set({
      clinicName: 'ZZ Legacy Clinic', name: 'Legacy Doctor', email: 'zz-legacy@example.invalid', specialty: 'General Physician',
      slotDurationMins: 15, reminderIntervals: [24, 1], registrationNumber: 'x', youtubeLinks: [], products: [], pageViews: 0,
      timings: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(d => [d, { open: true, morning: { start: '09:00', end: '20:00' }, evening: null }])),
    })
    await root('domains').doc(host).set({ clinicId: ID, storage: 'legacy', timezone: 'Asia/Kolkata' })
    const pids: string[] = [], aids: string[] = []
    for (let i = 1; i <= 3; i++) {
      const ref = root('patients').doc(); pids.push(ref.id)
      await ref.set({ name: `ZZ Legacy Patient ${i}`, phone: `+9190000000${i}0`, dob: new Date('1980-01-01T00:00:00Z'), createdAt: new Date() })
    }
    for (let i = 0; i < 3; i++) {
      const ref = root('appointments').doc(); aids.push(ref.id)
      await ref.set({ patientId: pids[i], doctorId: ID, startTime: future(48 + i), endTime: future(48 + i + 0.25), status: 'BOOKED', createdAt: new Date() })
    }
    await root('blocked_slots').doc('zzblock').set({ doctorId: ID, startTime: future(100), endTime: future(101), reason: 'rehearsal' })
    await root('whatsapp_logs').doc('zzlog').set({ to: '+910', status: 'sent', sentAt: new Date() })
    cleanup.push(async () => {
      await Promise.all([
        ...pids.map(i => root('patients').doc(i).delete()), ...aids.map(i => root('appointments').doc(i).delete()),
        root('blocked_slots').doc('zzblock').delete(), root('whatsapp_logs').doc('zzlog').delete(),
        root('doctors').doc(ID).delete(), root('domains').doc(host).delete(),
      ])
    })
    cleanup.push(async () => { await db.recursiveDelete(db.collection('clinics').doc(ID)) })
    cleanup.push(async () => { await auth.deleteUser(ID).catch(() => {}) })

    // ── 1. served as a legacy clinic ─────────────────────────────────────
    check('synthetic legacy clinic is served through the app', await waitFor(async () => (await api('/api/public/config')).status === 200))
    const cookie = await ownerCookie()
    const before = await api('/api/patients/search?q=ZZ Legacy&limit=50', { cookie })
    check('legacy owner session works and sees the 3 seeded patients', before.status === 200 && before.body.patients?.length === 3, `(${before.status}, ${before.body.patients?.length})`)

    // ── 2. dry run changes nothing ───────────────────────────────────────
    const dry = migrate()
    check('dry run reports the counts', dry.code === 0 && /patients: 3 docs/.test(dry.out) && /appointments: 3 docs/.test(dry.out))
    check('dry run copies nothing', (await db.collection('clinics').doc(ID).collection('patients').count().get()).data().count === 0)

    // ── 3. real copy, source untouched ───────────────────────────────────
    const run1 = migrate('--execute')
    check('copy succeeds and verifies counts', run1.code === 0 && /verified in target: 3/.test(run1.out), run1.code === 0 ? '' : run1.out.slice(-300))
    const sp = await scoped('patients'), sa = await scoped('appointments')
    check('scoped copy has the same patients and appointments', sp.size === 3 && sa.size === 3)
    const srcP = await root('patients').where('name', '>=', 'ZZ Legacy').where('name', '<=', 'ZZ Legacy~').get()
    check('copied documents are identical (same ids and content)',
      srcP.size === 3 && sp.docs.every(d => { const s = srcP.docs.find(x => x.id === d.id); return !!s && s.data().name === d.data().name && s.data().phone === d.data().phone }))
    check('the source is untouched', (await root('appointments').where('doctorId', '==', ID).get()).size === 3)
    check('the host still points at legacy until cut-over', (await root('domains').doc(host).get()).data()!.storage === 'legacy')

    // ── 4. drift, then re-run: idempotent, picks up the new doc, no duplicates ──
    const extra = root('patients').doc(); pids.push(extra.id)
    await extra.set({ name: 'ZZ Legacy Patient 4', phone: '+919000000040', dob: new Date('1980-01-01T00:00:00Z'), createdAt: new Date() })
    check('a second copy run succeeds', migrate('--execute').code === 0)
    check('re-running adds the new record and creates no duplicates', (await scoped('patients')).size === 4)

    // ── 5. cut over using the maintenance sequence from docs/ROLLOUT.md ──
    // Suspend -> every instance notices -> final copy -> flip -> every instance
    // notices -> reactivate. Nothing is served while the host could be
    // answered from either copy, so no write can land in the wrong place.
    await root('doctors').doc(ID).update({ status: 'suspended' })
    check('suspending the clinic takes it offline', await waitFor(async () => (await api('/api/public/config')).status === 404))
    await sleep(TENANT_CACHE_WAIT)
    const down = await Promise.all([1, 2, 3, 4, 5, 6].map(() => api('/api/public/config')))
    check('every instance agrees it is offline (no write can slip through)', down.every(r => r.status === 404))

    check('final copy while offline succeeds', migrate('--execute').code === 0)
    await root('domains').doc(host).update({ storage: 'scoped' })
    await sleep(TENANT_CACHE_WAIT)
    await db.collection('clinics').doc(ID).update({ status: 'active' }) // reactivate the scoped copy
    check('reactivated: the clinic serves again', await waitFor(async () => (await api('/api/public/config')).status === 200))
    await sleep(TENANT_CACHE_WAIT)

    const after = await api('/api/patients/search?q=ZZ Legacy&limit=50', { cookie })
    check('the same owner session reads all 4 patients', after.status === 200 && after.body.patients?.length === 4)
    const profile = await api('/api/doctor/profile', { cookie })
    check('the claim-less legacy owner is still recognised on the scoped clinic', profile.status === 200 && profile.body.doctor?.clinicName === 'ZZ Legacy Clinic')
    check('...with owner permissions', (await api('/api/doctor/team', { cookie })).status === 200)

    // bookings now land in the scoped copy, on every instance
    const cfg = (await api('/api/public/config')).body.config
    const ids: string[] = []
    for (let n = 0; n < 4; n++) {
      const slots = (await api(`/api/appointments?mode=slots&date=${ymd(cfg.today, 3)}`)).body.slots ?? []
      const slot = slots[n]
      const phone = '+91' + (9100000000 + ((Date.now() + n) % 99999999)).toString().slice(0, 10)
      const bk = await api('/api/appointments', { method: 'POST', json: { patient: { name: 'ZZ Post Cutover', phone, dob: '1990-01-01' }, startTime: slot.start, endTime: slot.end } })
      if (bk.status === 201) ids.push(bk.body.appointment.id)
    }
    check('4 bookings after cut-over all succeed', ids.length === 4, `(${ids.length})`)
    const inScoped = (await scoped('appointments')).docs.filter(d => ids.includes(d.id)).length
    let inLegacy = 0
    for (const i of ids) if ((await root('appointments').doc(i).get()).exists) inLegacy++
    check('every one was written to the scoped clinic', inScoped === 4, `(${inScoped}/4)`)
    check('none was written to the legacy collection', inLegacy === 0, `(${inLegacy})`)

    // ── 6. roll back ─────────────────────────────────────────────────────
    await root('domains').doc(host).update({ storage: 'legacy' })
    await sleep(TENANT_CACHE_WAIT)
    await root('doctors').doc(ID).update({ status: 'active' }) // the legacy copy was left suspended
    const rolled = await waitFor(async () => {
      const r = await api('/api/patients/search?q=ZZ Legacy&limit=50', { cookie })
      return r.status === 200 && r.body.patients?.length === 4
    }, 20)
    check('rolling back serves the original (legacy) data again', rolled)
    check('post-cut-over bookings are not in the legacy copy (documented: re-copy before retrying)', !(await root('appointments').doc(ids[0] ?? 'x').get()).exists)
  } finally {
    for (const fn of cleanup.reverse()) await fn().catch(() => {})
    await sweep().catch(() => {})
  }
  const failed = results.filter(([, ok]) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
