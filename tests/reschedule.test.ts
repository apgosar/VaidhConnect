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

import { bookAppointment, rescheduleAppointment, cancelAppointment } from '@/lib/modules/booking'
import { accessIdFor, type PatientSession } from '@/lib/modules/patientAccess'
import { notifyRescheduled } from '@/lib/modules/notifications'
import { patientRescheduleAllowance, PATIENT_MAX_RESCHEDULES, PATIENT_MIN_NOTICE_HOURS } from '@/lib/reschedulePolicy'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const closed = { open: false, morning: null, evening: null }

// Monday 2 Nov 2026, Kolkata. Slots 09:00-11:00 in 30-minute steps. "Now" is 00:00 IST.
const NOW = new Date('2026-11-01T18:30:00Z')
const slot = (hh: number, m = 0) => {
  const start = new Date(Date.UTC(2026, 10, 2, hh, m) - 5.5 * 3600_000)
  return { startTime: start.toISOString(), endTime: new Date(start.getTime() + 30 * 60_000).toISOString() }
}
const phone = '+919800000001'
const session: PatientSession = { phone, accessId: accessIdFor(phone), verified: true }
const otherSession: PatientSession = { phone: '+919800000099', accessId: accessIdFor('+919800000099'), verified: true }
const staff = { kind: 'staff' as const, uid: 'u1' }
const patientAuth = (s: PatientSession = session) => ({ kind: 'patient' as const, session: s })

let fs: FakeFirestore
const appts = () => fs.coll('clinics/c1/appointments')
const locks = () => [...fs.coll('clinics/c1/slot_locks').keys()]
// stored timestamps may come back wrapped (toDate); read both forms the same way
const iso = (v: any) => (v?.toDate ? v.toDate() : v).toISOString()
const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e: any) { return e } }

async function bookAs(hh: number, m = 0, who = { name: 'Asha Rao', phone: '9800000001' }, ip = '1.1.1.1') {
  const r = await bookAppointment(tenant, { patient: { ...who, phone: `+91${who.phone}`, dob: '1990-05-01' }, ...slot(hh, m), pin: '4821', chiefComplaint: 'Cough' }, { kind: 'public', ip, session: null })
  return r.appointment.id
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs)
  fs.coll('clinics').set('c1', {
    clinicName: 'Test Clinic', name: 'Dr Test', slotDurationMins: 30,
    timings: { monday: { open: true, morning: { start: '09:00', end: '11:00' }, evening: null }, tuesday: closed, wednesday: closed, thursday: closed, friday: closed, saturday: closed, sunday: closed },
  })
  vi.mocked(notifyRescheduled).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('rescheduleAppointment (staff)', () => {
  it('moves the same appointment: new time, old slot freed, new slot held, history kept', async () => {
    const id = await bookAs(9)
    const r = await rescheduleAppointment(tenant, id, slot(10), staff)

    expect(r.id).toBe(id)
    const a = appts().get(id)!
    expect(iso(a.startTime)).toBe(slot(10).startTime)
    expect(iso(a.endTime)).toBe(slot(10).endTime)
    expect(a.status).toBe('BOOKED')
    expect(a.chiefComplaint).toBe('Cough') // everything else is untouched
    expect(a.rescheduleCount).toBe(1)
    expect(iso(a.rescheduledFrom.startTime)).toBe(slot(9).startTime)
    expect(a.rescheduledBy).toBe('staff:u1')
    expect(appts().size).toBe(1) // not a second appointment
    expect(locks()).toHaveLength(1)
    expect(locks()[0]).toContain(String(new Date(slot(10).startTime).getTime()))
  })

  it('frees the old slot for someone else and takes the new one', async () => {
    const id = await bookAs(9)
    await rescheduleAppointment(tenant, id, slot(10), staff)
    const other = await err(bookAppointment(tenant, { patient: { name: 'Ravi', phone: '+919800000002', dob: '1980-01-01' }, ...slot(10), pin: '5738' }, { kind: 'public', ip: '2.2.2.2', session: null }))
    expect(other).toMatchObject({ status: 409 }) // new slot is taken
    await expect(bookAppointment(tenant, { patient: { name: 'Ravi', phone: '+919800000002', dob: '1980-01-01' }, ...slot(9), pin: '5738' }, { kind: 'public', ip: '2.2.2.2', session: null })).resolves.toBeTruthy()
  })

  it('tells the patient and the doctor, naming the old time', async () => {
    const id = await bookAs(9)
    await rescheduleAppointment(tenant, id, slot(10), staff)
    expect(notifyRescheduled).toHaveBeenCalledOnce()
    const [, , patient, appt, oldStart] = vi.mocked(notifyRescheduled).mock.calls[0] as any
    expect(patient.name).toBe('Asha Rao')
    expect(iso(appt.startTime)).toBe(slot(10).startTime)
    expect(oldStart.toISOString()).toBe(slot(9).startTime)
  })

  it('restarts the reminders for the new time', async () => {
    const id = await bookAs(9)
    appts().get(id)!.reminderSent1h = true
    vi.setSystemTime(new Date(NOW.getTime() - 3 * 86_400_000)) // three days before: far enough for both reminders
    const before = new Date('2026-11-01T18:30:00Z')
    expect(before).toBeTruthy()
    vi.setSystemTime(NOW)
    await rescheduleAppointment(tenant, id, slot(10), staff)
    const a = appts().get(id)!
    // booked ~9h ahead of the new time, so the 24h reminder is skipped but the 1h one is due
    expect(a.reminderSent24h).toBe(true)
    expect(a.reminderSent1h).toBe(false)
  })

  it('refuses a slot that someone else holds, and changes nothing', async () => {
    const a = await bookAs(9)
    await bookAs(10, 0, { name: 'Ravi Kumar', phone: '9800000002' }, '2.2.2.2')
    const e = await err(rescheduleAppointment(tenant, a, slot(10), staff))
    expect(e).toMatchObject({ status: 409, code: 'SLOT_TAKEN' })
    expect(iso(appts().get(a)!.startTime)).toBe(slot(9).startTime)
    expect(appts().get(a)!.rescheduleCount).toBeUndefined()
    expect(locks()).toHaveLength(2)
    expect(notifyRescheduled).not.toHaveBeenCalled()
  })

  it('refuses times that are not open slots: outside hours, off the grid, blocked, in the past', async () => {
    const id = await bookAs(9)
    expect(await err(rescheduleAppointment(tenant, id, slot(14), staff))).toMatchObject({ status: 409 })
    expect(await err(rescheduleAppointment(tenant, id, slot(9, 10), staff))).toMatchObject({ status: 409 })
    await fs.collection('clinics/c1/blocked_slots').doc('b').set({ doctorId: 'c1', startTime: new Date(slot(10).startTime), endTime: new Date(slot(10, 30).startTime) })
    expect(await err(rescheduleAppointment(tenant, id, slot(10), staff))).toMatchObject({ status: 409 })
    vi.setSystemTime(new Date(NOW.getTime() + 10.2 * 3600_000)) // 10:12 IST
    expect(await err(rescheduleAppointment(tenant, id, slot(10), staff))).toMatchObject({ status: 409 })
    expect(iso(appts().get(id)!.startTime)).toBe(slot(9).startTime)
  })

  it('refuses moving to the time it already has, an unknown appointment and a cancelled one', async () => {
    const id = await bookAs(9)
    expect(await err(rescheduleAppointment(tenant, id, slot(9), staff))).toMatchObject({ status: 409 }) // the slot is held by itself: not offered
    expect(await err(rescheduleAppointment(tenant, 'nope', slot(10), staff))).toMatchObject({ status: 404 })
    await cancelAppointment(tenant, id, staff)
    expect(await err(rescheduleAppointment(tenant, id, slot(10), staff))).toMatchObject({ status: 409 })
  })

  it('rejects an end before the start', async () => {
    const id = await bookAs(9)
    expect(await err(rescheduleAppointment(tenant, id, { startTime: slot(10).endTime, endTime: slot(10).startTime }, staff))).toMatchObject({ status: 400 })
    expect(await err(rescheduleAppointment(tenant, id, { startTime: 'junk', endTime: 'junk' }, staff))).toMatchObject({ status: 400 })
  })

  it('lets exactly one of two simultaneous moves into the same slot win', async () => {
    const a = await bookAs(9)
    const b = await bookAs(9, 30, { name: 'Ravi Kumar', phone: '9800000002' }, '2.2.2.2')
    const results = await Promise.allSettled([rescheduleAppointment(tenant, a, slot(10), staff), rescheduleAppointment(tenant, b, slot(10), staff)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const at10 = [...appts().values()].filter(x => iso(x.startTime) === slot(10).startTime)
    expect(at10).toHaveLength(1)
  })

  it('is not limited for staff: a third move is fine', async () => {
    const id = await bookAs(9)
    for (const next of [slot(9, 30), slot(10), slot(10, 30)]) await rescheduleAppointment(tenant, id, next, staff)
    expect(appts().get(id)!.rescheduleCount).toBe(3)
  })

  it('leaves a prescription and payment attached, because the appointment id does not change', async () => {
    const id = await bookAs(9)
    await fs.collection('clinics/c1/prescriptions').doc('rx').set({ appointmentId: id, patientId: 'p', medicines: [] })
    await rescheduleAppointment(tenant, id, slot(10), staff)
    const rx = await h.db.col('prescriptions').where('appointmentId', '==', id).get()
    expect(rx.empty).toBe(false)
  })
})

describe('rescheduleAppointment (patient)', () => {
  it('moves their own appointment', async () => {
    const id = await bookAs(10)
    await rescheduleAppointment(tenant, id, slot(10, 30), patientAuth())
    expect(iso(appts().get(id)!.startTime)).toBe(slot(10, 30).startTime)
    expect(appts().get(id)!.rescheduledBy).toBe('patient')
  })

  it('cannot move somebody else\'s appointment, and nothing changes', async () => {
    const id = await bookAs(9)
    expect(await err(rescheduleAppointment(tenant, id, slot(10), patientAuth(otherSession)))).toMatchObject({ status: 403 })
    expect(iso(appts().get(id)!.startTime)).toBe(slot(9).startTime)
  })

  it(`can move it ${PATIENT_MAX_RESCHEDULES} times, then is told to call the clinic`, async () => {
    const id = await bookAs(9)
    await rescheduleAppointment(tenant, id, slot(9, 30), patientAuth())
    await rescheduleAppointment(tenant, id, slot(10), patientAuth())
    const third = await err(rescheduleAppointment(tenant, id, slot(10, 30), patientAuth()))
    expect(third).toMatchObject({ status: 409, code: 'RESCHEDULE_NOT_ALLOWED' })
    expect(third.message).toMatch(/call the clinic/i)
    expect(iso(appts().get(id)!.startTime)).toBe(slot(10).startTime)
  })

  it(`cannot move it within ${PATIENT_MIN_NOTICE_HOURS} hours of the visit`, async () => {
    const id = await bookAs(9)
    vi.setSystemTime(new Date(slot(9).startTime).getTime() - 90 * 60_000) // 07:30 IST, visit 09:00
    expect(await err(rescheduleAppointment(tenant, id, slot(10), patientAuth()))).toMatchObject({ status: 409, code: 'RESCHEDULE_NOT_ALLOWED' })
    // staff still can
    await expect(rescheduleAppointment(tenant, id, slot(10), staff)).resolves.toBeTruthy()
  })
})

describe('patientRescheduleAllowance', () => {
  const start = new Date('2026-11-02T03:30:00Z') // 09:00 IST
  it('allows a first move with plenty of notice and says how many are left', () => {
    expect(patientRescheduleAllowance({ startTime: start }, NOW)).toEqual({ allowed: true, left: PATIENT_MAX_RESCHEDULES })
    expect(patientRescheduleAllowance({ startTime: start, rescheduleCount: 1 }, NOW).left).toBe(PATIENT_MAX_RESCHEDULES - 1)
  })
  it('refuses when the allowance is used up or the visit is too close, with a reason', () => {
    const used = patientRescheduleAllowance({ startTime: start, rescheduleCount: PATIENT_MAX_RESCHEDULES }, NOW)
    expect(used).toMatchObject({ allowed: false, left: 0 })
    expect(used.reason).toContain('call the clinic')
    const close = patientRescheduleAllowance({ startTime: start }, new Date(start.getTime() - 60 * 60_000))
    expect(close.allowed).toBe(false)
    expect(close.reason).toContain(`${PATIENT_MIN_NOTICE_HOURS} hours`)
  })
  it('allows it exactly at the notice boundary', () => {
    expect(patientRescheduleAllowance({ startTime: start }, new Date(start.getTime() - PATIENT_MIN_NOTICE_HOURS * 3_600_000)).allowed).toBe(true)
  })
})
