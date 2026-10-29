/**
 * End-to-end tenant isolation check against a deployed environment.
 * Signs in as two clinic owners, seeds one marker patient per clinic, then
 * verifies each owner sees only their own data and that a session issued for
 * one clinic is useless on the other clinic's host.
 *
 *   npx tsx --env-file=.env.staging scripts/verify-tenant-isolation.ts \
 *     --a clinica --a-host <hostA> --b clinicb --b-host <hostB>
 *
 * Seeds (and always removes) two temporary patients. Refuses to run unless
 * FIREBASE_PROJECT_ID contains "staging", so it can't touch production data.
 */
import { auth, db, arg } from './_admin'

const projectId = process.env.FIREBASE_PROJECT_ID ?? ''
if (!projectId.includes('staging')) {
  console.error(`Refusing to run: FIREBASE_PROJECT_ID "${projectId}" does not look like staging.`)
  process.exit(1)
}

const a = arg('a'), b = arg('b'), aHost = arg('a-host'), bHost = arg('b-host')
if (!a || !b || !aHost || !bHost) throw new Error('Required: --a --a-host --b --b-host')
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string

async function sessionFor(clinicId: string, host: string): Promise<string> {
  const clinic = await db.collection('clinics').doc(clinicId).get()
  const ownerUid = clinic.data()?.ownerUid as string
  const customToken = await auth.createCustomToken(ownerUid)
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  )
  const { idToken } = await exchange.json() as { idToken: string }
  const res = await fetch(`https://${host}/api/auth/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
  })
  const cookie = res.headers.getSetCookie().find(c => c.startsWith('session='))
  if (!res.ok || !cookie) throw new Error(`Could not establish a session for ${clinicId} (HTTP ${res.status})`)
  return cookie.split(';')[0]
}

const get = async (host: string, path: string, cookie?: string) => {
  const res = await fetch(`https://${host}${path}`, { headers: cookie ? { cookie } : {} })
  const text = await res.text()
  return { status: res.status, text }
}

const results: Array<[string, boolean]> = []
const check = (name: string, ok: boolean) => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`) }

async function main() {
  const markerA = `ZZ-Isolation-Alpha-${Date.now()}`, markerB = `ZZ-Isolation-Bravo-${Date.now()}`
  const pa = db.collection('clinics').doc(a!).collection('patients').doc()
  const pb = db.collection('clinics').doc(b!).collection('patients').doc()
  try {
    await pa.set({ name: markerA, phone: '+910000000001', dob: new Date('1990-01-01'), createdAt: new Date() })
    await pb.set({ name: markerB, phone: '+910000000002', dob: new Date('1990-01-01'), createdAt: new Date() })

    const cookieA = await sessionFor(a!, aHost!)
    const cookieB = await sessionFor(b!, bHost!)

    const q = (marker: string) => `/api/patients/search?q=${encodeURIComponent('ZZ-Isolation')}&limit=100&m=${marker}`

    const aOnA = await get(aHost!, q(markerA), cookieA)
    check('owner A on host A: sees own patient', aOnA.status === 200 && aOnA.text.includes(markerA))
    check('owner A on host A: does NOT see clinic B\'s patient', !aOnA.text.includes(markerB))

    const bOnB = await get(bHost!, q(markerB), cookieB)
    check('owner B on host B: sees own patient', bOnB.status === 200 && bOnB.text.includes(markerB))
    check('owner B on host B: does NOT see clinic A\'s patient', !bOnB.text.includes(markerA))

    for (const [label, path] of [['patient search', q('x')], ['doctor profile', '/api/doctor/profile'], ['calendar', '/api/doctor/appointments']] as const) {
      const aOnB = await get(bHost!, path, cookieA)
      const bOnA = await get(aHost!, path, cookieB)
      check(`A's session rejected on B's host (${label}) -> ${aOnB.status}`, aOnB.status === 401)
      check(`B's session rejected on A's host (${label}) -> ${bOnA.status}`, bOnA.status === 401)
    }

    const noAuth = await get(aHost!, q('x'))
    check(`no session rejected (${noAuth.status})`, noAuth.status === 401)

    const profA = await get(aHost!, '/api/doctor/profile', cookieA)
    check('owner A reads own profile', profA.status === 200 && profA.text.includes('Clinic A'))
  } finally {
    await pa.delete().catch(() => {})
    await pb.delete().catch(() => {})
  }
  const failed = results.filter(([, ok]) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
