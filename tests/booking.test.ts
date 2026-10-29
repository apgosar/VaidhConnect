import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/modules/notifications', () => ({
  notifyBooked: vi.fn(async () => {}),
  notifyCancelled: vi.fn(async () => {}),
  notifyDoctorScheduleUpdate: vi.fn(async () => {}),
}))

import { bookAppointment, cancelAppointment, lookupAppointments, reopenAppointment, BookingError } from '@/lib/modules/booking'
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
const pub = (ip = '1.1.1.1') => ({ kind: 'public' as const, ip })
const staff = { kind: 'staff' as const, uid: 'u1' }
const book = (s = slot(9), p: any = patient, actor: any = pub()) =>
  bookAppointment(tenant, { patient: { ...p, phone: p.phone.startsWith('+') ? p.phone : `+91${p.phone}` }, ...s }, actor)

let fs: FakeFirestore
const apptDocs = () => [...fs.coll('clinics/c1/appointments').values()]
const locks = () => [...fs.coll('clinics/c1/slot_locks').keys()]

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
  it('books a slot, creates the patient, takes a lock, and issues a one-time cancel token', async () => {
    const r = await book()
    expect(r.appointment.status).toBe('BOOKED')
    expect(r.cancelToken).toMatch(/^[\w-]{40,}$/)
    expect(apptDocs()).toHaveLength(1)
    expect(locks()).toHaveLength(1)
    expect([...fs.coll('clinics/c1/patients').values()]).toHaveLength(1)
    // only a hash of the token is stored
    expect(JSON.stringify(apptDocs()[0])).not.toContain(r.cancelToken!)
    expect(notifyBooked).toHaveBeenCalledOnce()
  })

  it('never returns any patient data in the response', async () => {
    const r = await book()
    const json = JSON.stringify(r)
    expect(json).not.toContain('Asha')
    expect(json).not.toContain('9800000001')
  })

  it('rejects a second booking of the same slot', async () => {
    await book()
    await expect(book(slot(9), { ...patient, name: 'Someone Else', phone: '9800000002' }, pub('2.2.2.2'))).rejects.toMatchObject({ status: 409 })
    expect(apptDocs()).toHaveLength(1)
  })

  it('lets exactly one of two simultaneous requests win', async () => {
    const results = await Promise.allSettled([
      book(slot(10), { ...patient, phone: '9800000010', name: 'Racer One' }, pub('3.3.3.3')),
      book(slot(10), { ...patient, phone: '9800000011', name: 'Racer Two' }, pub('4.4.4.4')),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect(apptDocs()).toHaveLength(1)
  })

  it('refuses slots that are not on the clinic\'s schedule', async () => {
    await expect(book(slot(14))).rejects.toMatchObject({ status: 409 })        // outside hours
    await expect(book(slot(9, 10))).rejects.toMatchObject({ status: 409 })     // off the 30-minute grid
    vi.setSystemTime(new Date(NOW.getTime() + 4 * 3600_000))                    // 04:00 IST: 09:00 still ahead
    await expect(book(slot(9))).resolves.toBeTruthy()
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 3600_000))                   // 10:00 IST: 09:30 already started
    await expect(book(slot(9, 30), { ...patient, name: 'Late', phone: '9800000003' }, pub('5.5.5.5'))).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a blocked-out slot', async () => {
    await fs.collection('clinics/c1/blocked_slots').doc('b2').set({ doctorId: 'c1', startTime: new Date(slot(9).startTime), endTime: new Date(slot(10).startTime) })
    await expect(book(slot(9))).rejects.toMatchObject({ status: 409 })
    await expect(book(slot(10))).resolves.toBeTruthy()
  })

  it('limits repeat bookings from one phone number per day', async () => {
    await book(slot(9)); await book(slot(9, 30)); await book(slot(10))
    await expect(book(slot(10, 30))).rejects.toMatchObject({ status: 429 })
  })

  it('limits bookings per IP address per hour', async () => {
    for (let i = 0; i < 4; i++) {
      await book(slot(9 + Math.floor(i / 2), (i % 2) * 30), { ...patient, name: `P${i}`, phone: `98000001${i}0` }, pub('9.9.9.9'))
    }
    // 4 succeeded (only 4 slots exist); the limiter itself allows 10/hour, so verify it is a counter, not a stub
    const counters = [...fs.coll('clinics/c1/rate_limits').values()].map(d => d.count)
    expect(Math.max(...counters)).toBeGreaterThanOrEqual(4)
  })

  it('does not allow a public caller to pick an existing patientId', async () => {
    await book()
    const id = [...fs.coll('clinics/c1/patients').keys()][0]
    await expect(
      bookAppointment(tenant, { patientId: id, ...slot(10) } as any, pub('6.6.6.6')),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('existing patients', () => {
  it('matches an existing record but never modifies it for a public caller', async () => {
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-05-01T00:00:00Z'), email: 'old@x.in', medicalHistory: 'Diabetes' })
    await book(slot(9), { ...patient, email: 'attacker@x.in', medicalHistory: 'overwritten' } as any)
    const p = fs.coll('clinics/c1/patients').get('p1')!
    expect(p.email).toBe('old@x.in')
    expect(p.medicalHistory).toBe('Diabetes')
    expect(fs.coll('clinics/c1/patients').size).toBe(1)   // reused, not duplicated
  })

  it('lets staff book by patientId, and update details they supply', async () => {
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-05-01T00:00:00Z') })
    const r = await bookAppointment(tenant, { patientId: 'p1', ...slot(9) } as any, staff)
    expect(r.cancelToken).toBeUndefined()      // staff bookings need no patient-side token
    expect(apptDocs()[0].createdBy).toBe('staff:u1')
    await expect(bookAppointment(tenant, { patientId: 'nope', ...slot(10) } as any, staff)).rejects.toMatchObject({ status: 404 })
  })
})

describe('cancelling', () => {
  it('cancels with the right token, frees the slot, and notifies', async () => {
    const { appointment, cancelToken } = await book()
    await cancelAppointment(tenant, appointment.id, { kind: 'token', token: cancelToken! })
    expect(apptDocs()[0].status).toBe('CANCELLED')
    expect(locks()).toHaveLength(0)
    expect(notifyCancelled).toHaveBeenCalledOnce()
    // the freed slot can be booked again
    await expect(book(slot(9), { ...patient, name: 'Next Person', phone: '9800000005' }, pub('7.7.7.7'))).resolves.toBeTruthy()
  })

  it('rejects a wrong or missing token and leaves the booking intact', async () => {
    const { appointment } = await book()
    await expect(cancelAppointment(tenant, appointment.id, { kind: 'token', token: 'x'.repeat(43) })).rejects.toMatchObject({ status: 403 })
    expect(apptDocs()[0].status).toBe('BOOKED')
    expect(locks()).toHaveLength(1)
  })

  it('cannot cancel twice', async () => {
    const { appointment, cancelToken } = await book()
    await cancelAppointment(tenant, appointment.id, { kind: 'token', token: cancelToken! })
    await expect(cancelAppointment(tenant, appointment.id, { kind: 'token', token: cancelToken! })).rejects.toMatchObject({ status: 409 })
  })

  it('lets staff cancel without a token', async () => {
    const { appointment } = await book()
    await cancelAppointment(tenant, appointment.id, { kind: 'staff', uid: 'u1' })
    expect(apptDocs()[0].cancelledBy).toBe('staff:u1')
  })

  it('reports an unknown appointment as 404', async () => {
    await expect(cancelAppointment(tenant, 'missing', { kind: 'staff', uid: 'u1' })).rejects.toBeInstanceOf(BookingError)
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
    await expect(reopenAppointment(tenant, first.appointment.id)).rejects.toMatchObject({ status: 409 })
  })
})

describe('my-appointments lookup', () => {
  it('returns only appointments whose token matches', async () => {
    const a = await book(slot(9))
    const b = await book(slot(9, 30), { ...patient, name: 'Other', phone: '9800000007' }, pub('1.2.3.4'))
    const out = await lookupAppointments(tenant, [
      { id: a.appointment.id, token: a.cancelToken! },
      { id: b.appointment.id, token: 'wrong-token-wrong-token-wrong-token' },
      { id: 'does-not-exist', token: a.cancelToken! },
    ])
    expect(out.map((x: any) => x.id)).toEqual([a.appointment.id])
    expect(JSON.stringify(out)).not.toContain('cancelTokenHash')
  })
})
