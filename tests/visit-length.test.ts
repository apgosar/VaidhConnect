import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/modules/notifications', () => ({
  notifyBooked: vi.fn(async () => {}),
  notifyCancelled: vi.fn(async () => {}),
  notifyRescheduled: vi.fn(async () => {}),
  notifyDoctorScheduleUpdate: vi.fn(async () => {}),
}))
vi.mock('@/lib/whatsapp', () => ({ sendPinResetCode: vi.fn(async () => true) }))

import { bookAppointment, rescheduleAppointment } from '@/lib/modules/booking'
import { isOpenRun, MAX_SLOTS_PER_VISIT, type TimeSlot } from '@/lib/slots'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const closed = { open: false, morning: null, evening: null }
const staff = { kind: 'staff' as const, uid: 'u1' }

// Monday 2 Nov 2026, Kolkata. 15-minute slots: 09:00-10:00 and 17:00-18:00. "Now" is 00:00 IST.
const NOW = new Date('2026-11-01T18:30:00Z')
const at = (hh: number, m = 0) => new Date(Date.UTC(2026, 10, 2, hh, m) - 5.5 * 3600_000)
const range = (hh: number, m: number, minutes: number) => ({ startTime: at(hh, m).toISOString(), endTime: new Date(at(hh, m).getTime() + minutes * 60_000).toISOString() })
const iso = (v: any) => (v?.toDate ? v.toDate() : v).toISOString()
const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e: any) { return e } }

let fs: FakeFirestore
const appts = () => fs.coll('clinics/c1/appointments')
const bookStaff = (hh: number, m: number, minutes: number, who = { name: 'Asha Rao', phone: '+919800000001' }) =>
  bookAppointment(tenant, { patient: { ...who, dob: '1990-05-01' }, ...range(hh, m, minutes) }, staff)

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs)
  fs.coll('clinics').set('c1', {
    clinicName: 'Test Clinic', name: 'Dr Test', slotDurationMins: 15,
    timings: { monday: { open: true, morning: { start: '09:00', end: '10:00' }, evening: { start: '17:00', end: '18:00' } }, tuesday: closed, wednesday: closed, thursday: closed, friday: closed, saturday: closed, sunday: closed },
  })
})
afterEach(() => vi.useRealTimers())

describe('isOpenRun', () => {
  const slots: TimeSlot[] = [0, 15, 30].map(m => ({ start: at(9, m).toISOString(), end: at(9, m + 15).toISOString(), label: '' }))
  it('needs every slot of the run to be open, in whole slots, up to the limit', () => {
    expect(isOpenRun(slots, at(9, 0), at(9, 15), 15)).toBe(true)
    expect(isOpenRun(slots, at(9, 0), at(9, 45), 15)).toBe(true)
    expect(isOpenRun(slots, at(9, 0), at(10, 0), 15)).toBe(false) // 9:45 is not open
    expect(isOpenRun(slots, at(9, 0), at(9, 20), 15)).toBe(false) // not a whole number of slots
    expect(isOpenRun(slots, at(9, 15), at(9, 15), 15)).toBe(false)
    expect(isOpenRun(slots, at(9, 0), at(9, 30), 15, 1)).toBe(false) // capped at one slot
    expect(MAX_SLOTS_PER_VISIT).toBe(8)
  })
})

describe('staff booking a longer visit', () => {
  it('books 30 minutes as two 15-minute slots and blocks both from anyone else', async () => {
    const r = await bookStaff(9, 0, 30)
    expect(iso(appts().get(r.appointment.id)!.endTime)).toBe(at(9, 30).toISOString())
    expect((await err(bookStaff(9, 15, 15, { name: 'Ravi Shah', phone: '+919811111111' })))?.status).toBe(409)
    expect((await bookStaff(9, 30, 15, { name: 'Ravi Shah', phone: '+919811111111' })).appointment.status).toBe('BOOKED')
  })

  it('refuses a visit that would run into a booking, the end of the session, or the lunch break', async () => {
    await bookStaff(9, 30, 15)
    expect((await err(bookStaff(9, 0, 45, { name: 'Ravi Shah', phone: '+919811111111' })))?.status).toBe(409) // 9:30 is taken
    expect((await err(bookStaff(9, 45, 30, { name: 'Ravi Shah', phone: '+919811111111' })))?.status).toBe(409) // session ends at 10:00
  })

  it('refuses lengths that are not whole slots, and more than the limit', async () => {
    expect((await err(bookStaff(17, 0, 20)))?.status).toBe(409)
    expect((await err(bookStaff(17, 0, 0)))?.status).toBe(409)
    expect((await bookStaff(17, 0, 60)).appointment.status).toBe('BOOKED') // 4 slots to the end of the evening session
  })

  it('is for clinic staff only: a patient can only take one slot', async () => {
    const e = await err(bookAppointment(tenant, { patient: { name: 'Asha Rao', phone: '+919800000001', dob: '1990-05-01' }, ...range(9, 0, 30), pin: '4821' }, { kind: 'public', ip: '1.1.1.1', session: null }))
    expect(e?.status).toBe(409)
  })
})

describe('moving a longer visit', () => {
  it('keeps its length, and needs every slot of the new time to be free', async () => {
    const r = await bookStaff(9, 0, 30)
    await bookStaff(9, 45, 15, { name: 'Ravi Shah', phone: '+919811111111' })
    // 9:30 + 30 min would run into the 9:45 booking
    const blocked = await err(rescheduleAppointment(tenant, r.appointment.id, range(9, 30, 15), staff))
    expect(blocked?.status).toBe(409)
    expect(iso(appts().get(r.appointment.id)!.startTime)).toBe(at(9, 0).toISOString())

    await rescheduleAppointment(tenant, r.appointment.id, range(17, 0, 15), staff) // the client names one slot; the visit stays 30 minutes
    const moved = appts().get(r.appointment.id)!
    expect(iso(moved.startTime)).toBe(at(17, 0).toISOString())
    expect(iso(moved.endTime)).toBe(at(17, 30).toISOString())
  })

  it('moves an ordinary one-slot visit exactly as before', async () => {
    const r = await bookStaff(9, 0, 15)
    await rescheduleAppointment(tenant, r.appointment.id, range(9, 30, 15), staff)
    expect(iso(appts().get(r.appointment.id)!.endTime)).toBe(at(9, 45).toISOString())
  })
})

describe('patients booking by an approximate age', () => {
  const patients = () => [...fs.coll('clinics/c1/patients').values()] as any[]

  it('stores the gender and that the date of birth is an estimate', async () => {
    await bookAppointment(tenant, { patient: { name: 'Asha Rao', phone: '+919800000001', dob: '1990-05-01', dobApproximate: true, gender: 'FEMALE' }, ...range(9, 0, 15) }, staff)
    expect(patients()[0]).toMatchObject({ gender: 'FEMALE', dobApproximate: true })
  })

  it('does not make a second record for the same person when the estimated date moves on', async () => {
    await bookAppointment(tenant, { patient: { name: 'Asha Rao', phone: '+919800000001', dob: '1990-05-01', dobApproximate: true }, ...range(9, 0, 15) }, staff)
    await bookAppointment(tenant, { patient: { name: 'asha rao', phone: '+919800000001', dob: '1990-11-05', dobApproximate: true, gender: 'FEMALE' }, ...range(9, 15, 15) }, staff)
    expect(patients()).toHaveLength(1)
    expect(patients()[0].gender).toBe('FEMALE') // filled in from the later booking
  })

  it('still tells two people on one number apart by their real dates of birth', async () => {
    await bookAppointment(tenant, { patient: { name: 'Asha Rao', phone: '+919800000001', dob: '1990-05-01' }, ...range(9, 0, 15) }, staff)
    await bookAppointment(tenant, { patient: { name: 'Asha Rao', phone: '+919800000001', dob: '2015-03-02' }, ...range(9, 15, 15) }, staff)
    expect(patients()).toHaveLength(2)
  })

  it('refuses a gender that is not Male, Female or Other', async () => {
    const { patientDetailsSchema } = await import('@/lib/validation')
    expect(patientDetailsSchema.safeParse({ name: 'Asha Rao', phone: '+919800000001', dob: '1990-05-01', gender: 'X' }).success).toBe(false)
    expect(patientDetailsSchema.safeParse({ name: 'Asha Rao', phone: '+919800000001', dob: '1990-05-01', gender: 'OTHER' }).success).toBe(true)
  })
})
