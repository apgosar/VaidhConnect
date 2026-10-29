/**
 * End-to-end behaviour check against a deployed STAGING environment:
 * public booking without OTP, cancel tokens, double-booking, what an
 * anonymous visitor can and cannot reach, role permissions, and the operator
 * console (including suspending a clinic). Creates temporary data and removes it.
 *
 *   npx tsx --env-file=.env.staging scripts/verify-flows.ts \
 *     --a clinica --a-host <hostA> --b clinicb --b-host <hostB> --admin-host <host in PLATFORM_ADMIN_HOSTS>
 *
 * Refuses to run unless FIREBASE_PROJECT_ID contains "staging".
 */
import { auth, db, arg } from './_admin'

const projectId = process.env.FIREBASE_PROJECT_ID ?? ''
if (!projectId.includes('staging')) { console.error(`Refusing to run on "${projectId}": not a staging project.`); process.exit(1) }

const a = arg('a')!, b = arg('b')!, aHost = arg('a-host')!, bHost = arg('b-host')!, adminHost = arg('admin-host')!
if (!a || !b || !aHost || !bHost || !adminHost) throw new Error('Required: --a --a-host --b --b-host --admin-host')
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string

const results: Array<[string, boolean]> = []
const check = (name: string, ok: boolean, extra = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

async function http(host: string, path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = { ...(init.headers as any) }
  if (init.cookie) headers.cookie = init.cookie
  if (init.json !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`https://${host}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body, text, res }
}

async function cookieForUid(uid: string, host: string, path: string, name: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid)
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  const { idToken } = await ex.json() as { idToken: string }
  const r = await http(host, path, { method: 'POST', json: { idToken } })
  const c = r.res.headers.getSetCookie().find(x => x.startsWith(`${name}=`))
  if (!c) throw new Error(`no ${name} cookie from ${host}${path} (HTTP ${r.status}: ${r.text.slice(0, 120)})`)
  return c.split(';')[0]
}

const ymdPlus = (base: string, n: number) => new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10) + n)).toISOString().slice(0, 10)

async function main() {
  const cleanup: Array<() => Promise<unknown>> = []
  try {
    const stamp = Date.now()
    const cfg = (await http(aHost, '/api/public/config')).body.config
    check('public config exposes the clinic timezone and today', typeof cfg?.timezone === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cfg?.today))

    // ── find two open slots on clinic A ────────────────────────────────────
    let slots: any[] = []
    for (let i = 0; i < 14 && slots.length < 3; i++) {
      slots = (await http(aHost, `/api/appointments?mode=slots&date=${ymdPlus(cfg.today, i)}`)).body.slots ?? []
    }
    check('clinic A has bookable slots', slots.length >= 3)
    const [s1, s2] = slots

    // ── anonymous visitor: what is closed ──────────────────────────────────
    const closed: Array<[string, string, number[]]> = [
      ['/api/patient/otp/bypass', 'POST', [404, 405]],
      ['/api/patient/otp/send', 'POST', [404, 405]],
      ['/api/patient/session', 'GET', [404]],
      ['/api/patients/lookup?phone=%2B919999999999', 'GET', [404]],
      ['/api/patients', 'POST', [401]],
      ['/api/patients/search?q=ab', 'GET', [401]],
      ['/api/doctor/appointments', 'GET', [401]],
      ['/api/doctor/team', 'GET', [401]],
      ['/api/admin/clinics', 'GET', [404]],   // console not served on a clinic host
    ]
    for (const [p, m, ok] of closed) {
      const r = await http(aHost, p, { method: m, ...(m === 'POST' ? { json: {} } : {}) })
      check(`anonymous ${m} ${p.split('?')[0]} -> ${r.status}`, ok.includes(r.status))
    }

    // ── public booking, no OTP ─────────────────────────────────────────────
    const person = { name: `ZZ Verify ${stamp}`, phone: '+91' + (9800000000 + (stamp % 99999999)).toString().padStart(10, '9').slice(0, 10), dob: '1991-02-03' }
    const book = (slot: any, p = person) => http(aHost, '/api/appointments', { method: 'POST', json: { patient: p, startTime: slot.start, endTime: slot.end, chiefComplaint: 'verification' } })
    const booked = await book(s1)
    check('public booking succeeds without any login', booked.status === 201, `(${booked.status})`)
    const apptId = booked.body?.appointment?.id as string, token = booked.body?.cancelToken as string
    check('response carries a one-time cancel token and no patient data', !!token && !JSON.stringify(booked.body).includes('ZZ Verify') && !JSON.stringify(booked.body).includes(person.phone.slice(3)))
    cleanup.push(async () => { await db.collection('clinics').doc(a).collection('appointments').doc(apptId).delete() })
    cleanup.push(async () => { const s = await db.collection('clinics').doc(a).collection('patients').where('name', '==', person.name).get(); await Promise.all(s.docs.map(d => d.ref.delete())) })

    const again = await book(s1, { ...person, name: `ZZ Other ${stamp}`, phone: '+919800000098' })
    check('the same slot cannot be booked twice', again.status === 409, `(${again.status})`)

    const lookupOk = await http(aHost, '/api/appointments/lookup', { method: 'POST', json: { items: [{ id: apptId, token }] } })
    check('my-appointments works with the right token', lookupOk.status === 200 && lookupOk.body.appointments?.length === 1 && lookupOk.body.appointments[0].id === apptId)
    const lookupBad = await http(aHost, '/api/appointments/lookup', { method: 'POST', json: { items: [{ id: apptId, token: 'x'.repeat(43) }] } })
    check('my-appointments returns nothing for a wrong token', lookupBad.status === 200 && lookupBad.body.appointments?.length === 0)
    const lookupOtherClinic = await http(bHost, '/api/appointments/lookup', { method: 'POST', json: { items: [{ id: apptId, token }] } })
    check('a token is useless on another clinic\'s host', lookupOtherClinic.body.appointments?.length === 0)

    const badCancel = await http(aHost, `/api/appointments/${apptId}`, { method: 'PATCH', json: { status: 'CANCELLED', token: 'y'.repeat(43) } })
    check('cancel with a wrong token is refused', badCancel.status === 403, `(${badCancel.status})`)
    const noToken = await http(aHost, `/api/appointments/${apptId}`, { method: 'PATCH', json: { status: 'CANCELLED' } })
    check('cancel with no token and no login is refused', noToken.status === 401, `(${noToken.status})`)
    const notes = await http(aHost, `/api/appointments/${apptId}`, { method: 'PATCH', json: { consultationNotes: 'tampered', token } })
    check('a patient token cannot edit clinical notes', notes.status === 401, `(${notes.status})`)

    const goodCancel = await http(aHost, `/api/appointments/${apptId}`, { method: 'PATCH', json: { status: 'CANCELLED', token } })
    check('cancel with the right token works', goodCancel.status === 200, `(${goodCancel.status})`)
    const rebook = await book(s1, { ...person, name: `ZZ Verify ${stamp}` })
    check('the freed slot can be booked again', rebook.status === 201, `(${rebook.status})`)
    if (rebook.body?.appointment?.id) cleanup.push(async () => { await db.collection('clinics').doc(a).collection('appointments').doc(rebook.body.appointment.id).delete() })

    const bad = await http(aHost, '/api/appointments', { method: 'POST', json: { patient: { ...person, dob: '2999-01-01' }, startTime: s2.start, endTime: s2.end } })
    check('invalid input is rejected with a 400', bad.status === 400, `(${bad.status})`)

    // ── roles: invite a front-desk user to clinic A ────────────────────────
    const ownerUid = (await db.collection('clinics').doc(a).get()).data()!.ownerUid as string
    const ownerCookie = await cookieForUid(ownerUid, aHost, '/api/auth/session', 'session')
    const staffEmail = `zz-staff-${stamp}@example.invalid`
    const invite = await http(aHost, '/api/doctor/team', { method: 'POST', cookie: ownerCookie, json: { email: staffEmail, name: 'ZZ Staff', role: 'STAFF' } })
    check('owner can add a front-desk user', invite.status === 201, `(${invite.status})`)
    const staffUid = invite.body?.member?.uid as string
    cleanup.push(async () => { if (staffUid) { await auth.deleteUser(staffUid).catch(() => {}); await db.collection('clinics').doc(a).collection('users').doc(staffUid).delete() } })
    const staffCookie = await cookieForUid(staffUid, aHost, '/api/auth/session', 'session')

    const staff = (p: string, m = 'GET', json?: unknown) => http(aHost, p, { method: m, cookie: staffCookie, ...(json !== undefined ? { json } : {}) })
    check('front desk can view the calendar', (await staff('/api/doctor/appointments')).status === 200)
    check('front desk can search patients', (await staff('/api/patients/search?q=ZZ')).status === 200)
    check('front desk cannot open the team', (await staff('/api/doctor/team')).status === 403)
    check('front desk cannot change clinic settings', (await staff('/api/doctor/profile', 'PATCH', { clinicName: 'Hacked' })).status === 403)
    check('front desk cannot write prescriptions', (await staff('/api/prescriptions', 'POST', { appointmentId: 'x', patientId: 'y' })).status === 403)
    check('front desk cannot read WhatsApp logs', (await staff('/api/doctor/whatsapp-logs')).status === 403)
    const hitStaffOnB = await http(bHost, '/api/doctor/appointments', { cookie: staffCookie })
    check('front desk session is rejected on clinic B', hitStaffOnB.status === 401)

    const staffBook = await staff('/api/appointments', 'POST', { patient: { ...person, name: `ZZ Staffbooked ${stamp}`, phone: '+919800000097' }, startTime: s2.start, endTime: s2.end })
    check('front desk can book on a patient\'s behalf', staffBook.status === 201 && !staffBook.body.cancelToken, `(${staffBook.status})`)
    if (staffBook.body?.appointment?.id) cleanup.push(async () => { await db.collection('clinics').doc(a).collection('appointments').doc(staffBook.body.appointment.id).delete() })
    cleanup.push(async () => { const s = await db.collection('clinics').doc(a).collection('patients').where('name', '==', `ZZ Staffbooked ${stamp}`).get(); await Promise.all(s.docs.map(d => d.ref.delete())) })

    const ownerAudit = await db.collection('clinics').doc(a).collection('audit_logs').where('action', '==', 'appointment.book').get()
    check('staff bookings are recorded in the activity log', ownerAudit.size >= 1)

    const disable = await http(aHost, '/api/doctor/team', { method: 'PATCH', cookie: ownerCookie, json: { uid: staffUid, disabled: true } })
    check('owner can switch a user\'s access off', disable.status === 200)
    check('a disabled user\'s existing session stops working', (await staff('/api/doctor/appointments')).status === 401)

    // ── operator console ───────────────────────────────────────────────────
    const adminEmail = `zz-admin-${stamp}@example.invalid`
    const adminUser = await auth.createUser({ email: adminEmail })
    await auth.setCustomUserClaims(adminUser.uid, { platformAdmin: true })
    cleanup.push(async () => { await auth.deleteUser(adminUser.uid).catch(() => {}) })

    const asOwner = await http(adminHost, '/api/admin/session', { method: 'POST', json: { idToken: 'not-a-token' } })
    check('console rejects a bogus token', asOwner.status === 403)
    const adminCookie = await cookieForUid(adminUser.uid, adminHost, '/api/admin/session', 'admin_session')
    const list = await http(adminHost, '/api/admin/clinics', { cookie: adminCookie })
    check('operator can list clinics', list.status === 200 && list.body.clinics?.some((c: any) => c.id === a) && list.body.clinics?.some((c: any) => c.id === b))
    const ownerOnAdmin = await http(adminHost, '/api/admin/clinics', { cookie: ownerCookie })
    check('a clinic owner is not an operator', ownerOnAdmin.status === 404)
    const adminOnClinicHost = await http(aHost, '/api/admin/clinics', { cookie: adminCookie })
    check('the console is not reachable through a clinic hostname', adminOnClinicHost.status === 404)

    // flags + suspension propagate to live traffic (tenant cache is ~60s)
    const susp = await http(adminHost, `/api/admin/clinics/${b}`, { method: 'PATCH', cookie: adminCookie, json: { status: 'suspended', features: { payments: false } } })
    check('operator can suspend a clinic and flip a single plan flag', susp.status === 200, `(${susp.status} ${susp.status === 200 ? '' : susp.text.slice(0, 100)})`)
    cleanup.push(async () => { await db.collection('clinics').doc(b).update({ status: 'active', 'features.payments': true }) })
    let suspended = false
    for (let i = 0; i < 20 && !suspended; i++) {
      suspended = (await http(bHost, '/api/public/config')).status === 404
      if (!suspended) await new Promise(r => setTimeout(r, 6000))
    }
    check('a suspended clinic stops serving within ~2 minutes', suspended)
    const stillA = await http(aHost, '/api/public/config')
    check('other clinics are unaffected by the suspension', stillA.status === 200)
    const react = await http(adminHost, `/api/admin/clinics/${b}`, { method: 'PATCH', cookie: adminCookie, json: { status: 'active' } })
    check('operator can reactivate it', react.status === 200, `(${react.status})`)
    let back = false
    for (let i = 0; i < 20 && !back; i++) {
      back = (await http(bHost, '/api/public/config')).status === 200
      if (!back) await new Promise(r => setTimeout(r, 6000))
    }
    check('a reactivated clinic comes back', back)
  } finally {
    for (const fn of cleanup.reverse()) await fn().catch(() => {})
  }
  const failed = results.filter(([, ok]) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
