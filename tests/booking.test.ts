import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/modules/notifications', () => ({
  notifyBooked: vi.fn(async () => {}),
  notifyCancelled: vi.fn(async () => {}),
  notifyDoctorScheduleUpdate: vi.fn(async () => {}),
}))
vi.mock('@/lib/whatsapp', () => ({ sendPinResetCode: vi.fn(async () => true) }))

import { bookAppointment, cancelAppointment, reopenAppointment, BookingError } from '@/lib/modules/booking'
import { accessIdFor, getAccess, MAX_WRONG_TRIES, staffSetPin, type PatientSession } from '@/lib/modules/patientAccess'
import { notifyBooked, notifyCancelled } from '@/lib/modules/notifications'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const closed = { open: false, morning: null, evening: null }

// Monday 2 Nov 2026, Kolkata. Slots: 09:00–11:00 in 30-minute steps.
const NOW = new Date('2026-11-01T18:30:00Z') // = 00:00 IST on the 2nd
const slot = (h: number, m = 0) => {
  const start = new Date(Date.UTC(2026, 10, 2, h, m) - 5.5 * 3600_000)
  return { startTime: start.toISOString(), endTime: new Date(start.getTime() + 30 * 60_000).toISOString() }
}

const patient = { name: 'Asha Rao', phone: '9800000001', dob: '1990-05-01' }
const e164 = (p: string) => (p.startsWith('+') ? p : `+91${p}`)
const pub = (ip = '1.1.1.1', session?: PatientSession | null) => ({ kind: 'public' as const, ip, session })
const staff = { kind: 'staff' as const, uid: 'u1' }

/** Book as a patient. Defaults to presenting PIN 4821. */
const book = (s = slot(9), p: any = patient, actor: any = pub(), pin: string | null = '4821') =>
  bookAppointment(tenant, { patient: { ...p, phone: e164(p.phone) }, ...s, ...(pin ? { pin } : {}) }, actor)

const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e: any) { return e } }

let fs: FakeFirestore
const apptDocs = () => [...fs.coll('clinics/c1/appointments').values()]
const locks = () => [...fs.coll('clinics/c1/slot_locks').keys()]
const patients = () => [...fs.coll('clinics/c1/patients').values()]

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs)
  fs.coll('clinics').set('c1', {
    clinicName: 'Test Clinic', name: 'Dr Test', slotDurationMins: 30,
    timings: { monday: { open: true, morning: { start: '09:00', end: '11:00' }, evening: null }, tuesday: closed, wednesday: closed, thursday: closed, friday: closed, saturday: closed, sunday: closed },
  })
  vi.mocked(notifyBooked).mockClear(); vi.mocked(notifyCancelled).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('public booking', () => {
  it('books a slot, creates the patient, takes a lock, and starts a PIN session', async () => {
    const r = await book()
    expect(r.appointment.status).toBe('BOOKED')
    expect(apptDocs()).toHaveLength(1)
    expect(locks()).toHaveLength(1)
    expect(patients()).toHaveLength(1)
    expect(r.pinSession).toMatchObject({ phone: '+919800000001' })
    expect(notifyBooked).toHaveBeenCalledOnce()
  })

  it('never returns any patient data in the response', async () => {
    // The route strips pinSession (it only sets the cookie) before responding.
    const { pinSession: _cookieOnly, ...body } = await book()
    const json = JSON.stringify(body)
    expect(json).not.toContain('Asha')
    expect(json).not.toContain('9800000001')
    expect(json).not.toMatch(/pinHash|accessId/)
  })

  it('links the booking to the PIN that made it', async () => {
    await book()
    expect(apptDocs()[0].accessId).toBe(accessIdFor('+919800000001'))
  })

  it('rejects a second booking of the same slot', async () => {
    await book()
    expect(await err(book(slot(9), { ...patient, name: 'Other', phone: '9800000002' }, pub('2.2.2.2')))).toMatchObject({ status: 409 })
    expect(apptDocs()).toHaveLength(1)
  })

  it('lets exactly one of two simultaneous requests win', async () => {
    const results = await Promise.allSettled([
      book(slot(10), { ...patient, phone: '9800000010', name: 'Racer One' }, pub('3.3.3.3')),
      book(slot(10), { ...patient, phone: '9800000011', name: 'Racer Two' }, pub('4.4.4.4')),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(apptDocs()).toHaveLength(1)
  })

  it('refuses slots that are not on the clinic\'s schedule', async () => {
    expect(await err(book(slot(14)))).toMatchObject({ status: 409 })        // outside hours
    expect(await err(book(slot(9, 10)))).toMatchObject({ status: 409 })     // off the 30-minute grid
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 3600_000))               // 10:00 IST: 09:30 already started
    expect(await err(book(slot(9, 30), { ...patient, name: 'Late', phone: '9800000003' }, pub('5.5.5.5')))).toMatchObject({ status: 409 })
  })

  it('refuses a blocked-out slot', async () => {
    await fs.collection('clinics/c1/blocked_slots').doc('b2').set({ doctorId: 'c1', startTime: new Date(slot(9).startTime), endTime: new Date(slot(10).startTime) })
    expect(await err(book(slot(9)))).toMatchObject({ status: 409 })
    await expect(book(slot(10))).resolves.toBeTruthy()
  })

  it('limits repeat bookings from one phone number per day', async () => {
    await book(slot(9)); await book(slot(9, 30)); await book(slot(10))
    expect(await err(book(slot(10, 30)))).toMatchObject({ status: 429 })
  })

  it('does not allow a public caller to pick an existing patientId', async () => {
    await book()
    const id = [...fs.coll('clinics/c1/patients').keys()][0]
    expect(await err(bookAppointment(tenant, { patientId: id, ...slot(10) } as any, pub('6.6.6.6')))).toMatchObject({ status: 403 })
  })
})

describe('the PIN gate on public bookings', () => {
  it('a number with no PIN must choose one — and nothing is created without it', async () => {
    const e = await err(book(slot(9), patient, pub(), null))
    expect(e).toMatchObject({ code: 'PIN_SETUP_REQUIRED', status: 400 })
    expect(patients()).toHaveLength(0)
    expect(apptDocs()).toHaveLength(0)
    expect(fs.coll('clinics/c1/patient_access').size).toBe(0)
  })

  it('a weak PIN is refused', async () => {
    expect(await err(book(slot(9), patient, pub(), '1234'))).toMatchObject({ code: 'PIN_WEAK' })
    expect(apptDocs()).toHaveLength(0)
  })

  it('the first booking sets an UNVERIFIED PIN', async () => {
    await book()
    expect(await getAccess(h.db, '+919800000001')).toMatchObject({ verified: false, setBy: 'patient' })
  })

  it('afterwards, booking with that number needs the PIN', async () => {
    await book(slot(9))
    expect(await err(book(slot(9, 30), patient, pub(), null))).toMatchObject({ code: 'PIN_REQUIRED', status: 401 })
  })

  it('a stranger cannot book in someone else\'s name: wrong PIN is refused and creates NOTHING', async () => {
    await book(slot(9))
    const before = { appts: apptDocs().length, pts: patients().length }
    const e = await err(book(slot(9, 30), { ...patient, name: 'Victim Impersonation' }, pub('7.7.7.7'), '9999'))
    expect(e).toMatchObject({ code: 'PIN_WRONG', status: 401 })
    expect({ appts: apptDocs().length, pts: patients().length }).toEqual(before)
  })

  it('the right PIN books again', async () => {
    await book(slot(9))
    await expect(book(slot(9, 30), patient, pub(), '4821')).resolves.toBeTruthy()
  })

  it('a live PIN session for the same number is accepted without re-entering the PIN', async () => {
    await book(slot(9))
    const session: PatientSession = { phone: '+919800000001', accessId: accessIdFor('+919800000001'), verified: false }
    await expect(book(slot(9, 30), patient, pub('1.1.1.1', session), null)).resolves.toBeTruthy()
  })

  it('...but a session for ANOTHER number does not unlock this one', async () => {
    await book(slot(9))
    const other: PatientSession = { phone: '+919800000002', accessId: accessIdFor('+919800000002'), verified: true }
    expect(await err(book(slot(9, 30), patient, pub('1.1.1.1', other), null))).toMatchObject({ code: 'PIN_REQUIRED' })
  })

  it(`${MAX_WRONG_TRIES} wrong PINs lock the number against booking`, async () => {
    await book(slot(9))
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await err(book(slot(9, 30), patient, pub('8.8.8.8'), '0002'))
    expect(await err(book(slot(9, 30), patient, pub('8.8.8.8'), '4821'))).toMatchObject({ code: 'PIN_LOCKED', status: 429 })
  })

  it('wrong guesses by someone else do not use up the real owner\'s daily booking allowance', async () => {
    await book(slot(9))                                   // 1 booking used
    for (let i = 0; i < MAX_WRONG_TRIES - 1; i++) await err(book(slot(9, 30), patient, pub('8.8.8.8'), '0002'))  // below the lockout
    await expect(book(slot(9, 30))).resolves.toBeTruthy() // 2nd
    await expect(book(slot(10))).resolves.toBeTruthy()    // 3rd — still allowed
    expect(await err(book(slot(10, 30)))).toMatchObject({ status: 429 })  // the 4th is over the limit
  })

  it('staff booking needs no PIN and sets none', async () => {
    const r = await bookAppointment(tenant, { patient: { ...patient, phone: '+919800000001' }, ...slot(9) } as any, staff)
    expect(r.pinSession).toBeUndefined()
    expect(fs.coll('clinics/c1/patient_access').size).toBe(0)
    expect(apptDocs()[0].createdBy).toBe('staff:u1')
    expect(apptDocs()[0].accessId).toBeUndefined()
  })

  it('staff can book even for a number that has a PIN', async () => {
    await book(slot(9))
    await expect(bookAppointment(tenant, { patient: { ...patient, phone: '+919800000001' }, ...slot(9, 30) } as any, staff)).resolves.toBeTruthy()
  })
})

describe('existing patients', () => {
  it('matches an existing record but never modifies it for a public caller', async () => {
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-05-01T00:00:00Z'), email: 'old@x.in', medicalHistory: 'Diabetes' })
    await book(slot(9), { ...patient, email: 'attacker@x.in', medicalHistory: 'overwritten' })
    const p = fs.coll('clinics/c1/patients').get('p1')!
    expect(p.email).toBe('old@x.in')
    expect(p.medicalHistory).toBe('Diabetes')
    expect(fs.coll('clinics/c1/patients').size).toBe(1)   // reused, not duplicated
  })

  it('lets staff book by patientId', async () => {
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-05-01T00:00:00Z') })
    const r = await bookAppointment(tenant, { patientId: 'p1', ...slot(9) } as any, staff)
    expect(r.pinSession).toBeUndefined()
    expect(await err(bookAppointment(tenant, { patientId: 'nope', ...slot(10) } as any, staff))).toMatchObject({ status: 404 })
  })
})

describe('cancelling', () => {
  const sessionFor = (phone: string, verified: boolean): PatientSession => ({ phone, accessId: accessIdFor(phone), verified })

  it('the PIN session that booked can cancel; the slot is freed and the patient notified', async () => {
    const { appointment } = await book()
    await cancelAppointment(tenant, appointment.id, { kind: 'patient', session: sessionFor('+919800000001', false) })
    expect(apptDocs()[0].status).toBe('CANCELLED')
    expect(apptDocs()[0].cancelledBy).toBe('patient')
    expect(locks()).toHaveLength(0)
    expect(notifyCancelled).toHaveBeenCalledOnce()
    await expect(book(slot(9), { ...patient, name: 'Next Person', phone: '9800000005' }, pub('9.9.9.9'))).resolves.toBeTruthy()
  })

  it('another number\'s session cannot cancel it — even a verified one', async () => {
    const { appointment } = await book()
    expect(await err(cancelAppointment(tenant, appointment.id, { kind: 'patient', session: sessionFor('+919800000002', true) }))).toMatchObject({ status: 403 })
    expect(apptDocs()[0].status).toBe('BOOKED')
    expect(locks()).toHaveLength(1)
  })

  it('an UNVERIFIED session cannot cancel a staff-booked appointment on its number', async () => {
    const { appointment } = await bookAppointment(tenant, { patient: { ...patient, phone: '+919800000001' }, ...slot(9) } as any, staff)
    expect(await err(cancelAppointment(tenant, appointment.id, { kind: 'patient', session: sessionFor('+919800000001', false) }))).toMatchObject({ status: 403 })
  })

  it('a VERIFIED session can (staff set the PIN at the desk)', async () => {
    const { appointment } = await bookAppointment(tenant, { patient: { ...patient, phone: '+919800000001' }, ...slot(9) } as any, staff)
    await staffSetPin(h.db, '+919800000001', '4821')
    await cancelAppointment(tenant, appointment.id, { kind: 'patient', session: sessionFor('+919800000001', true) })
    expect(apptDocs()[0].status).toBe('CANCELLED')
  })

  it('cannot cancel twice', async () => {
    const { appointment } = await book()
    const auth = { kind: 'patient' as const, session: sessionFor('+919800000001', false) }
    await cancelAppointment(tenant, appointment.id, auth)
    expect(await err(cancelAppointment(tenant, appointment.id, auth))).toMatchObject({ status: 409 })
  })

  it('lets staff cancel without any PIN', async () => {
    const { appointment } = await book()
    await cancelAppointment(tenant, appointment.id, { kind: 'staff', uid: 'u1' })
    expect(apptDocs()[0].cancelledBy).toBe('staff:u1')
  })

  it('reports an unknown appointment as 404', async () => {
    expect(await err(cancelAppointment(tenant, 'missing', { kind: 'staff', uid: 'u1' }))).toBeInstanceOf(BookingError)
  })
})

describe('re-opening a cancelled appointment', () => {
  it('works if the slot is still free, and is refused if someone else took it', async () => {
    const first = await book()
    await cancelAppointment(tenant, first.appointment.id, { kind: 'staff', uid: 'u1' })
    await reopenAppointment(tenant, first.appointment.id)
    expect(apptDocs()[0].status).toBe('BOOKED')

    await cancelAppointment(tenant, first.appointment.id, { kind: 'staff', uid: 'u1' })
    await book(slot(9), { ...patient, name: 'Taker', phone: '9800000006' }, pub('8.8.8.8'))
    expect(await err(reopenAppointment(tenant, first.appointment.id))).toMatchObject({ status: 409 })
  })
})
