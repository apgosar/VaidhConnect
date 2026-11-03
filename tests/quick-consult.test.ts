import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))

import { createQuickConsult, dobFromAge, QuickConsultError } from '@/lib/modules/quickConsult'
import { PrescriptionError } from '@/lib/modules/prescriptions'
import { POST as quickPost } from '@/app/api/doctor/quick-prescription/route'
import { audit } from '@/lib/audit'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const NOW = new Date('2026-11-05T04:30:00Z') // 10:00 IST, Thu 5 Nov 2026
const iso = (v: any) => (v?.toDate ? v.toDate() : v).toISOString()
let fs: FakeFirestore
const all = (c: string) => [...fs.coll(`clinics/c1/${c}`).values()] as any[]
const med = { name: 'Paracetamol', dosage: '500 mg', frequency: 'Thrice a day', duration: '3 days' }
const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e: any) { return e } }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs); h.session = null
  fs.collection('clinics').doc('c1').set({ slotDurationMins: 20, name: 'Dr A' })
  vi.mocked(audit).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('dobFromAge', () => {
  it('makes someone exactly that age today', () => {
    expect(dobFromAge(36, '2026-11-05')).toBe('1990-11-05')
    expect(dobFromAge(0, '2026-11-05')).toBe('2026-11-05')
  })
})

describe('createQuickConsult', () => {
  it('adds a new patient from an age, records a completed visit and saves the prescription', async () => {
    const r = await createQuickConsult(tenant, 'u1', { patient: { name: ' Asha Rao ', phone: '+919800000001', ageYears: 36 }, chiefComplaint: ' Fever and cough for 3 days ', diagnosis: 'Viral fever', medicines: [med] })
    expect(r.patientCreated).toBe(true)

    const [patient] = all('patients')
    expect(patient).toMatchObject({ name: 'Asha Rao', phone: '+919800000001', dobApproximate: true, createdBy: 'staff:u1' })
    expect(iso(patient.dob)).toBe('1990-11-05T00:00:00.000Z')

    const [appt] = all('appointments')
    expect(appt).toMatchObject({ status: 'COMPLETED', visitType: 'TELECONSULTATION', patientId: r.patientId, chiefComplaint: 'Fever and cough for 3 days', reminderSent24h: true, reminderSent1h: true })
    expect(iso(appt.startTime)).toBe(NOW.toISOString())
    expect(iso(appt.endTime)).toBe(new Date(NOW.getTime() + 20 * 60_000).toISOString())

    const [rx] = all('prescriptions')
    expect(rx).toMatchObject({ appointmentId: r.appointmentId, patientId: r.patientId, diagnosis: 'Viral fever' })
    expect(rx.medicines).toHaveLength(1)
  })

  it('has no chief complaint unless the doctor wrote one (it is never filled in for them)', async () => {
    await createQuickConsult(tenant, 'u1', { patient: { name: 'Asha Rao', phone: '+919800000001', ageYears: 36 }, medicines: [med] })
    await createQuickConsult(tenant, 'u1', { patient: { name: 'Ravi Shah', phone: '+919800000002', ageYears: 40 }, chiefComplaint: '   ', medicines: [med] })
    expect(all('appointments').map(a => a.chiefComplaint)).toEqual([null, null])
  })

  it('keeps a given date of birth as recorded, not as an estimate', async () => {
    await createQuickConsult(tenant, 'u1', { patient: { name: 'Ravi Shah', phone: '+919800000002', dob: '1985-02-03' }, medicines: [med] })
    const [patient] = all('patients')
    expect(iso(patient.dob)).toBe('1985-02-03T00:00:00.000Z')
    expect(patient.dobApproximate).toBeUndefined()
  })

  it('treats the same name on the same number as the same person, however the age was typed', async () => {
    const first = await createQuickConsult(tenant, 'u1', { patient: { name: 'Asha Rao', phone: '+919800000001', ageYears: 36 }, medicines: [med] })
    const again = await createQuickConsult(tenant, 'u1', { patient: { name: 'asha rao', phone: '+919800000001', ageYears: 37 }, medicines: [med] })
    expect(again.patientCreated).toBe(false)
    expect(again.patientId).toBe(first.patientId)
    expect(all('patients')).toHaveLength(1)
    expect(all('appointments')).toHaveLength(2)
  })

  it('a different person on the same number is a new patient (families share phones)', async () => {
    await createQuickConsult(tenant, 'u1', { patient: { name: 'Asha Rao', phone: '+919800000001', ageYears: 36 }, medicines: [med] })
    const child = await createQuickConsult(tenant, 'u1', { patient: { name: 'Mihir Rao', phone: '+919800000001', ageYears: 8 }, medicines: [med] })
    expect(child.patientCreated).toBe(true)
    expect(all('patients')).toHaveLength(2)
  })

  it('uses an existing patient by id and does not touch their record', async () => {
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-01-01T00:00:00Z') })
    const r = await createQuickConsult(tenant, 'u1', { patientId: 'p1', medicines: [med] })
    expect(r).toMatchObject({ patientId: 'p1', patientCreated: false })
    expect(all('patients')).toHaveLength(1)
    expect(iso(all('patients')[0].dob)).toBe('1990-01-01T00:00:00.000Z')
    expect(await err(createQuickConsult(tenant, 'u1', { patientId: 'nope', medicines: [med] }))).toMatchObject({ status: 404 })
  })

  it('needs a medicine, and an age or date of birth for a new patient', async () => {
    expect(await err(createQuickConsult(tenant, 'u1', { patient: { name: 'Asha', phone: '+919800000001', ageYears: 30 }, medicines: [{ ...med, name: '  ' }] }))).toBeInstanceOf(QuickConsultError)
    expect(await err(createQuickConsult(tenant, 'u1', { patient: { name: 'Asha', phone: '+919800000001' }, medicines: [med] }))).toBeInstanceOf(QuickConsultError)
    expect(await err(createQuickConsult(tenant, 'u1', { medicines: [med] }))).toBeInstanceOf(QuickConsultError)
    expect(all('patients')).toHaveLength(0)
    expect(all('appointments')).toHaveLength(0)
  })

  it('leaves nothing behind when the prescription is refused (follow-up before the visit)', async () => {
    const e = await err(createQuickConsult(tenant, 'u1', { patient: { name: 'Asha Rao', phone: '+919800000001', ageYears: 36 }, medicines: [med], followUpDate: '2026-11-01' }))
    expect(e).toBeInstanceOf(PrescriptionError)
    expect(all('patients')).toHaveLength(0)
    expect(all('appointments')).toHaveLength(0)
    expect(all('prescriptions')).toHaveLength(0)
  })

  it('does not take a booking slot: no lock is made and the visit is not BOOKED', async () => {
    await createQuickConsult(tenant, 'u1', { patient: { name: 'Asha Rao', phone: '+919800000001', ageYears: 36 }, medicines: [med] })
    expect(all('slot_locks')).toHaveLength(0)
    expect(all('appointments').every(a => a.status !== 'BOOKED')).toBe(true)
  })

  it('stores a tapering medicine the same way the appointment page does', async () => {
    await createQuickConsult(tenant, 'u1', {
      patient: { name: 'Asha Rao', phone: '+919800000001', ageYears: 36 },
      medicines: [{ name: 'Prednisolone', dosage: '', frequency: '', duration: '', taper: { steps: [{ dose: '40 mg', frequency: 'Once a day', days: 5 }, { dose: '20 mg', frequency: 'Once a day', days: 5 }] } }],
    })
    expect(all('prescriptions')[0].medicines[0]).toMatchObject({ dosage: '40 mg', frequency: 'Tapering', duration: '10 days' })
  })
})

describe('POST /api/doctor/quick-prescription', () => {
  const call = (body: unknown) => quickPost(new Request('http://x/api/doctor/quick-prescription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const good = { patient: { name: 'Asha Rao', phone: '98 00000001', ageYears: 36 }, diagnosis: 'Fever', medicines: [med] }

  it('needs a login and the prescription and patient permissions', async () => {
    expect((await call(good)).status).toBe(401)
    h.session = { uid: 'u2', role: 'STAFF' } // front desk: patients yes, prescriptions no
    expect((await call(good)).status).toBe(403)
    expect(all('appointments')).toHaveLength(0)
  })

  it('creates the visit and prescription for a doctor, normalising a bare 10-digit number to +91', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    const res = await call({ ...good, patient: { ...good.patient, phone: '9800000001' } })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ patientCreated: true })
    expect(typeof body.prescriptionId).toBe('string')
    expect(all('patients')[0].phone).toBe('+919800000001')
    expect(audit).toHaveBeenCalledWith(tenant, h.session, 'consult.quick', expect.stringMatching(/^appointments\//), { patientCreated: true })
  })

  it('passes the chief complaint through to the visit', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    expect((await call({ ...good, chiefComplaint: 'Fever' })).status).toBe(201)
    expect(all('appointments')[0].chiefComplaint).toBe('Fever')
    expect((await call({ ...good, chiefComplaint: 'x'.repeat(501) })).status).toBe(400)
  })

  it('answers bad input with a clear 400 and writes nothing', async () => {
    h.session = { uid: 'u1', role: 'OWNER' }
    for (const bad of [
      {}, { ...good, patient: undefined },
      { ...good, patient: { ...good.patient, phone: '123' } },
      { ...good, patient: { ...good.patient, name: 'A' } },
      { ...good, patient: { name: 'Asha Rao', phone: '9800000001' } },
      { ...good, patient: { ...good.patient, ageYears: 150 } },
      { ...good, patientId: 'p1' },
      { ...good, medicines: [] },
    ]) {
      const res = await call(bad)
      expect(res.status, JSON.stringify(bad)).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(all('patients')).toHaveLength(0)
    expect(all('appointments')).toHaveLength(0)
  })

  it('limits one user to 60 consultations an hour', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    for (let i = 0; i < 60; i++) expect((await call(good)).status).toBe(201)
    expect((await call(good)).status).toBe(429)
  })
})

describe('age and date of birth helpers', () => {
  it('turn one into the other', async () => {
    const { ageFromDob, dobFromAge: fromAge } = await import('@/lib/time')
    expect(ageFromDob('1990-11-05', '2026-11-05')).toBe(36)
    expect(ageFromDob('1990-11-06', '2026-11-05')).toBe(35) // birthday still to come
    expect(ageFromDob('2026-11-05', '2026-11-05')).toBe(0)
    for (const age of [0, 1, 36, 99]) expect(ageFromDob(fromAge(age, '2026-11-05'), '2026-11-05')).toBe(age)
  })
  it('handles 29 February', async () => {
    const { ageFromDob, dobFromAge: fromAge } = await import('@/lib/time')
    expect(fromAge(1, '2028-02-29')).toBe('2027-02-28') // 2027 has no 29 Feb
    expect(fromAge(4, '2028-02-29')).toBe('2024-02-29')
    expect(ageFromDob(fromAge(1, '2028-02-29'), '2028-02-29')).toBe(1)
  })
})

describe('saving a prescription updates the chief complaint of the visit', () => {
  const setup = async (complaint: string | null) => {
    await fs.collection('clinics/c1/appointments').doc('a1').set({ patientId: 'p1', startTime: NOW, endTime: NOW, status: 'BOOKED', chiefComplaint: complaint })
  }
  const complaintNow = () => all('appointments')[0].chiefComplaint
  const base = { appointmentId: 'a1', patientId: 'p1', medicines: [med] }

  it('writes what the doctor entered (even where the patient gave one when booking)', async () => {
    const { savePrescription } = await import('@/lib/modules/prescriptions')
    await setup('fever')
    await savePrescription(tenant, { ...base, chiefComplaint: ' Fever and body ache ' })
    expect(complaintNow()).toBe('Fever and body ache')
  })
  it('leaves it alone when the field was not sent, and clears it when it was emptied', async () => {
    const { savePrescription } = await import('@/lib/modules/prescriptions')
    await setup('fever')
    await savePrescription(tenant, base)
    expect(complaintNow()).toBe('fever')
    await savePrescription(tenant, { ...base, chiefComplaint: '  ' })
    expect(complaintNow()).toBeNull()
  })
})
