import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, sent: [] as Array<{ to: string; code: string }>, sendOk: true }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/whatsapp', () => ({
  sendPinResetCode: vi.fn(async (to: string, p: { code: string }) => { h.sent.push({ to, code: p.code }); return h.sendOk }),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import {
  accessIdFor, confirmPinReset, getAccess, hasPin, LOCK_SECONDS, listMyAppointments, MAX_WRONG_TRIES, PinError, pinProblem,
  requestPinReset, sessionOwnsAppointment, setInitialPin, staffResetPin, staffSetPin, verifyPin, type PatientSession,
} from '@/lib/modules/patientAccess'
import { signSession, verifySession } from '@/lib/auth/patientPin'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const PHONE = '+919800000001'
const NOW = new Date('2026-11-02T10:00:00Z')

let fs: FakeFirestore
const code = async (p: Promise<unknown>) => { try { await p; return 'ok' } catch (e) { return e instanceof PinError ? e.code : String(e) } }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs); h.sent.length = 0; h.sendOk = true
})
afterEach(() => vi.useRealTimers())

describe('PIN policy', () => {
  it('accepts an ordinary 4-digit PIN', () => { expect(pinProblem('4821')).toBeNull() })
  it.each(['0000', '1111', '1234', '4321', '2580', '123', '12345', '12a4', '', ' 4821'])('rejects %j', pin => {
    expect(pinProblem(pin)).not.toBeNull()
  })
})

describe('setting a PIN', () => {
  it('stores only a salted hash, keyed by a hashed phone id (no plaintext PIN or number)', async () => {
    await setInitialPin(h.db, PHONE, '4821')
    const stored = JSON.stringify([...fs.coll('clinics/c1/patient_access').entries()])
    expect(stored).not.toContain('4821')
    expect(stored).not.toContain('9800000001')
    expect([...fs.coll('clinics/c1/patient_access').keys()][0]).toBe(accessIdFor(PHONE))
  })

  it('a patient-chosen PIN is NOT verified', async () => {
    await setInitialPin(h.db, PHONE, '4821')
    expect((await getAccess(h.db, PHONE))!.verified).toBe(false)
  })

  it('refuses a weak PIN, and refuses to overwrite an existing one', async () => {
    expect(await code(setInitialPin(h.db, PHONE, '1234'))).toBe('PIN_WEAK')
    await setInitialPin(h.db, PHONE, '4821')
    expect(await code(setInitialPin(h.db, PHONE, '7391'))).toBe('PIN_EXISTS')
    await expect(verifyPin(h.db, PHONE, '4821')).resolves.toBeTruthy() // original survives
  })

  it('two simultaneous first-time claims: exactly one wins', async () => {
    const r = await Promise.allSettled([setInitialPin(h.db, PHONE, '4821'), setInitialPin(h.db, PHONE, '7391')])
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('hasPin reflects state', async () => {
    expect(await hasPin(h.db, PHONE)).toBe(false)
    await setInitialPin(h.db, PHONE, '4821')
    expect(await hasPin(h.db, PHONE)).toBe(true)
  })
})

describe('checking a PIN, and lockouts', () => {
  beforeEach(async () => { await setInitialPin(h.db, PHONE, '4821') })

  it('accepts the right PIN and rejects a wrong one, saying how many tries are left', async () => {
    await expect(verifyPin(h.db, PHONE, '4821')).resolves.toMatchObject({ verified: false })
    const e = await verifyPin(h.db, PHONE, '9999').catch(x => x)
    expect(e).toMatchObject({ code: 'PIN_WRONG', status: 401 })
    expect(e.message).toContain(`${MAX_WRONG_TRIES - 1} tries left`)
  })

  it(`locks the number after ${MAX_WRONG_TRIES} wrong tries — and then rejects even the RIGHT PIN`, async () => {
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await verifyPin(h.db, PHONE, '0001').catch(() => {})
    const locked = await verifyPin(h.db, PHONE, '4821').catch(x => x)
    expect(locked).toMatchObject({ code: 'PIN_LOCKED', status: 429, retryAfterSec: LOCK_SECONDS[0] })
  })

  it('the lock expires, and success resets the counters', async () => {
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await verifyPin(h.db, PHONE, '0001').catch(() => {})
    vi.setSystemTime(new Date(NOW.getTime() + (LOCK_SECONDS[0] + 5) * 1000))
    await expect(verifyPin(h.db, PHONE, '4821')).resolves.toBeTruthy()
    const a = await getAccess(h.db, PHONE)
    expect(a).toMatchObject({ failed: 0, lockLevel: 0 })
  })

  it('repeated lockouts escalate: 15 minutes, then 1 hour, then 24 hours', async () => {
    const seen: number[] = []
    for (let round = 0; round < 4; round++) {
      let e: any
      for (let i = 0; i < MAX_WRONG_TRIES; i++) e = await verifyPin(h.db, PHONE, '0001').catch(x => x)
      seen.push(e.retryAfterSec)
      vi.setSystemTime(new Date(Date.now() + (e.retryAfterSec + 5) * 1000))
    }
    expect(seen).toEqual([LOCK_SECONDS[0], LOCK_SECONDS[1], LOCK_SECONDS[2], LOCK_SECONDS[2]])
  })

  it('parallel guessing cannot beat the counter', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => verifyPin(h.db, PHONE, String(1000 + i)).catch((x: PinError) => x.code)))
    expect(results.filter(r => r === 'PIN_WRONG').length).toBeLessThan(MAX_WRONG_TRIES)   // at most 4 told "wrong"; the 5th locks
    expect(results.filter(r => r === 'PIN_LOCKED').length).toBeGreaterThanOrEqual(20 - MAX_WRONG_TRIES)
  })

  it('a phone with no PIN says so', async () => {
    expect(await code(verifyPin(h.db, '+919800000099', '4821'))).toBe('NO_PIN')
  })

  it('a PIN for one number is no good for another', async () => {
    await setInitialPin(h.db, '+919800000002', '7391')
    expect(await code(verifyPin(h.db, '+919800000002', '4821'))).toBe('PIN_WRONG')
  })
})

describe('staff-managed PINs', () => {
  it('a PIN set at the desk is verified; clearing it signs everyone out and makes the next one unverified', async () => {
    await staffSetPin(h.db, PHONE, '4821')
    const set = await getAccess(h.db, PHONE)
    expect(set).toMatchObject({ verified: true, verifiedBy: 'staff', setBy: 'staff' })

    await staffResetPin(h.db, PHONE)
    const reset = await getAccess(h.db, PHONE)
    expect(reset).toMatchObject({ verified: false })
    expect(reset!.pinVersion).toBeGreaterThan(set!.pinVersion)       // old sessions die
    expect(await code(verifyPin(h.db, PHONE, '4821'))).toBe('NO_PIN')

    await setInitialPin(h.db, PHONE, '7391')
    expect((await getAccess(h.db, PHONE))!.verified).toBe(false)     // patient-chosen again: unverified
  })

  it('staff reset also clears an active lockout', async () => {
    await setInitialPin(h.db, PHONE, '4821')
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await verifyPin(h.db, PHONE, '0001').catch(() => {})
    await staffResetPin(h.db, PHONE)
    await setInitialPin(h.db, PHONE, '7391')
    await expect(verifyPin(h.db, PHONE, '7391')).resolves.toBeTruthy()
  })

  it('refuses a weak PIN at the desk too', async () => {
    expect(await code(staffSetPin(h.db, PHONE, '0000'))).toBe('PIN_WEAK')
  })
})

describe('resetting by WhatsApp code', () => {
  const request = () => requestPinReset(tenant, PHONE, '1.1.1.1', new Date())

  it('sends a 6-digit code to that number, and the right code sets a VERIFIED PIN', async () => {
    await setInitialPin(h.db, PHONE, '4821')
    await request()
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ to: PHONE })
    expect(h.sent[0].code).toMatch(/^\d{6}$/)

    const r = await confirmPinReset(h.db, PHONE, h.sent[0].code, '7391')
    expect(r.verified).toBe(true)
    expect((await getAccess(h.db, PHONE))).toMatchObject({ verified: true, verifiedBy: 'whatsapp' })
    await expect(verifyPin(h.db, PHONE, '7391')).resolves.toBeTruthy()
    expect(await code(verifyPin(h.db, PHONE, '4821'))).toBe('PIN_WRONG')   // old PIN is gone
  })

  it('works for a number with no PIN yet (lets a patient verify up front)', async () => {
    await request()
    await expect(confirmPinReset(h.db, PHONE, h.sent[0].code, '7391')).resolves.toMatchObject({ verified: true })
  })

  it('never stores the code in plaintext', async () => {
    await request()
    expect(JSON.stringify([...fs.coll('clinics/c1/patient_access').values()])).not.toContain(h.sent[0].code)
  })

  it('a wrong code is refused; five wrong attempts burn the code', async () => {
    await request()
    for (let i = 0; i < 5; i++) expect(await code(confirmPinReset(h.db, PHONE, '000000', '7391'))).toBe('CODE_WRONG')
    expect(await code(confirmPinReset(h.db, PHONE, h.sent[0].code, '7391'))).toBe('CODE_EXPIRED') // even the right one now
  })

  it('an expired code is refused', async () => {
    await request()
    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000))
    expect(await code(confirmPinReset(h.db, PHONE, h.sent[0].code, '7391', new Date()))).toBe('CODE_EXPIRED')
  })

  it('a code is single-use', async () => {
    await request()
    const c = h.sent[0].code
    await confirmPinReset(h.db, PHONE, c, '7391')
    expect(await code(confirmPinReset(h.db, PHONE, c, '5927'))).toBe('CODE_EXPIRED')
  })

  it('refuses a weak new PIN without spending the code', async () => {
    await request()
    expect(await code(confirmPinReset(h.db, PHONE, h.sent[0].code, '1234'))).toBe('PIN_WEAK')
    await expect(confirmPinReset(h.db, PHONE, h.sent[0].code, '7391')).resolves.toBeTruthy()
  })

  it('is rate-limited: not more than one code a minute', async () => {
    await request()
    expect(await code(request())).toBe('RESET_RATE')
  })

  it('reports a failed send instead of pretending', async () => {
    h.sendOk = false
    expect(await code(request())).toBe('RESET_SEND_FAILED')
  })

  it('ending sessions: a reset bumps the PIN version', async () => {
    await setInitialPin(h.db, PHONE, '4821')
    const before = (await getAccess(h.db, PHONE))!.pinVersion
    await request()
    await confirmPinReset(h.db, PHONE, h.sent[0].code, '7391')
    expect((await getAccess(h.db, PHONE))!.pinVersion).toBeGreaterThan(before)
  })
})

describe('what a signed-in patient can see and cancel', () => {
  const future = (h: number) => new Date(NOW.getTime() + h * 3_600_000)
  const mine = accessIdFor(PHONE)
  const sess = (verified: boolean): PatientSession => ({ phone: PHONE, accessId: mine, verified })

  beforeEach(async () => {
    const put = (c: string, id: string, d: any) => fs.collection(`clinics/c1/${c}`).doc(id).set(d)
    await put('patients', 'p1', { name: 'Asha', phone: PHONE })
    await put('patients', 'p2', { name: 'Someone Else', phone: '+919800000002' })
    await put('appointments', 'staffBooked', { patientId: 'p1', status: 'BOOKED', startTime: future(5), endTime: future(6) })
    await put('appointments', 'portalBooked', { patientId: 'p1', status: 'BOOKED', accessId: mine, startTime: future(8), endTime: future(9), chiefComplaint: 'cough' })
    await put('appointments', 'cancelled', { patientId: 'p1', status: 'CANCELLED', accessId: mine, startTime: future(10), endTime: future(11) })
    await put('appointments', 'past', { patientId: 'p1', status: 'BOOKED', accessId: mine, startTime: future(-5), endTime: future(-4) })
    await put('appointments', 'strangers', { patientId: 'p2', status: 'BOOKED', startTime: future(12), endTime: future(13) })
  })

  const ids = async (s: PatientSession) => (await listMyAppointments(tenant, s, NOW)).map(a => a.id)

  it('an UNVERIFIED PIN sees only what was booked under it — never what the clinic already held', async () => {
    expect(await ids(sess(false))).toEqual(['portalBooked'])
  })

  it('a VERIFIED PIN sees every upcoming appointment on that number, including staff-booked ones', async () => {
    expect(await ids(sess(true))).toEqual(['staffBooked', 'portalBooked'])
  })

  it('never shows other numbers, cancelled or past appointments', async () => {
    const all = await ids(sess(true))
    for (const bad of ['strangers', 'cancelled', 'past']) expect(all).not.toContain(bad)
  })

  it('never exposes medical history or notes', async () => {
    const json = JSON.stringify(await listMyAppointments(tenant, sess(true), NOW))
    expect(json).not.toMatch(/medicalHistory|consultationNotes|cancelTokenHash|pinHash/)
  })

  it('cancel rights follow the same rule', () => {
    expect(sessionOwnsAppointment(sess(false), { accessId: mine }, PHONE)).toBe(true)
    expect(sessionOwnsAppointment(sess(false), {}, PHONE)).toBe(false)                    // staff-booked, unverified
    expect(sessionOwnsAppointment(sess(true), {}, PHONE)).toBe(true)                      // staff-booked, verified
    expect(sessionOwnsAppointment(sess(true), {}, '+919800000002')).toBe(false)           // someone else's patient
    expect(sessionOwnsAppointment(sess(true), { accessId: 'other' }, '+919800000002')).toBe(false)
  })
})

describe('session cookies', () => {
  // Built per test: the fake clock is set in beforeEach, so a module-level Date.now() would be stale.
  const claims = () => ({ c: 'c1', p: PHONE, v: 3, e: Date.now() + 60_000 })

  it('round-trips a valid session', () => {
    expect(verifySession(signSession(claims()), 'c1')).toMatchObject({ p: PHONE, v: 3 })
  })
  it('rejects a session for a different clinic', () => {
    expect(verifySession(signSession(claims()), 'c2')).toBeNull()
  })
  it('rejects an expired session', () => {
    expect(verifySession(signSession({ ...claims(), e: Date.now() - 1 }), 'c1')).toBeNull()
  })
  it('rejects tampering with the payload or the signature', () => {
    const [body, sig] = signSession(claims()).split('.')
    const forged = Buffer.from(JSON.stringify({ ...claims(), p: '+919999999999' })).toString('base64url')
    expect(verifySession(`${forged}.${sig}`, 'c1')).toBeNull()
    expect(verifySession(`${body}.${sig.slice(0, -2)}AA`, 'c1')).toBeNull()
  })
  it.each([undefined, '', 'garbage', 'a.b', '.'])('rejects %j', v => {
    expect(verifySession(v as any, 'c1')).toBeNull()
  })
})
