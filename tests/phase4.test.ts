import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({
  db: null as any,
  session: null as any,
  rendered: [] as string[],
}))

vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/patientPin', () => ({ getPatientSession: async () => h.session }))
vi.mock('@/lib/firebase/server', () => ({ adminDb: {} }))
vi.mock('@/lib/modules/documents', () => ({
  renderPrescriptionPdf: async (_t: unknown, id: string) => { h.rendered.push(id); return { buffer: Buffer.from('%PDF-1.4'), filename: 'Prescription_X.pdf' } },
}))

import { rememberMedicines, searchMedicines, normalizeName } from '@/lib/modules/medicineCatalog'
import { processFollowUps, type FollowUpDeps } from '@/lib/modules/followUp'
import { listMyPrescriptions, accessIdFor, type PatientSession } from '@/lib/modules/patientAccess'
import { GET as listRoute } from '@/app/api/patient/prescriptions/route'
import { GET as pdfRoute } from '@/app/api/patient/prescriptions/[appointmentId]/pdf/route'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const med = (name: string, extra: Record<string, unknown> = {}) => ({ name, dosage: '500 mg', frequency: 'BD', duration: '3 days', ...extra })

describe('medicine catalog', () => {
  beforeEach(() => { h.db = fakeTenantDb(new FakeFirestore()) })

  it('suggests medicines by name prefix, ignoring case and extra spaces', async () => {
    await rememberMedicines(h.db, [med('Paracetamol'), med('Pantoprazole'), med('Amoxicillin')])
    expect((await searchMedicines(h.db, 'PA')).map(m => m.name).sort()).toEqual(['Pantoprazole', 'Paracetamol'])
    expect((await searchMedicines(h.db, '  paracet ')).map(m => m.name)).toEqual(['Paracetamol'])
    expect(await searchMedicines(h.db, 'xyz')).toEqual([])
  })

  it('needs at least two characters', async () => {
    await rememberMedicines(h.db, [med('Paracetamol')])
    expect(await searchMedicines(h.db, 'p')).toEqual([])
    expect(await searchMedicines(h.db, '')).toEqual([])
  })

  it('offers the way it was prescribed most recently, with its tapering schedule', async () => {
    await rememberMedicines(h.db, [med('Prednisolone', { dosage: '10 mg' })])
    const taper = { steps: [{ dose: '40 mg', frequency: 'Once daily', days: 5 }] }
    await rememberMedicines(h.db, [med('prednisolone ', { dosage: '40 mg', taper })])
    const [hit] = await searchMedicines(h.db, 'pred')
    expect(hit).toMatchObject({ name: 'prednisolone', dosage: '40 mg', uses: 2, taper })
  })

  it('ranks the most used first', async () => {
    await rememberMedicines(h.db, [med('Pantoprazole')])
    await rememberMedicines(h.db, [med('Paracetamol')])
    await rememberMedicines(h.db, [med('Paracetamol')])
    expect((await searchMedicines(h.db, 'pa')).map(m => m.name)).toEqual(['Paracetamol', 'Pantoprazole'])
  })

  it('does not count a medicine again when the same prescription is saved again', async () => {
    await rememberMedicines(h.db, [med('Paracetamol')])
    await rememberMedicines(h.db, [med('Paracetamol'), med('Cetirizine')], ['Paracetamol'])
    const byName = Object.fromEntries((await searchMedicines(h.db, 'ce')).concat(await searchMedicines(h.db, 'pa')).map(m => [m.name, m.uses]))
    expect(byName).toEqual({ Cetirizine: 1, Paracetamol: 1 })
  })

  it('counts a medicine once even if it appears twice on one prescription, and ignores blanks', async () => {
    await rememberMedicines(h.db, [med('Paracetamol'), med('paracetamol'), med('   ')])
    expect((await searchMedicines(h.db, 'pa'))[0].uses).toBe(1)
    expect((await h.db.col('medicine_catalog').get()).size).toBe(1)
  })

  it('keeps each clinic to its own medicines', async () => {
    const other = fakeTenantDb(new FakeFirestore(), "c2") as any
    await rememberMedicines(h.db, [med('Paracetamol')])
    expect(await searchMedicines(other, 'para')).toEqual([])
  })

  it('normalises names', () => {
    expect(normalizeName('  Tab   Paracetamol  ')).toBe('tab paracetamol')
  })
})

describe('follow-up reminders', () => {
  // 10:00 in Kolkata on 2 Nov 2026
  const morning = new Date('2026-11-02T04:30:00Z')
  const doctor = { name: 'Shah', clinicName: 'Shah Clinic', phone: '+919900000000' }
  let send: ReturnType<typeof vi.fn>
  let deps: FollowUpDeps

  beforeEach(async () => {
    h.db = fakeTenantDb(new FakeFirestore())
    send = vi.fn(async () => true)
    deps = { bookingUrl: async () => 'https://shah.example.in', send: send as any }
    await h.db.col('patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001' })
    await h.db.col('prescriptions').doc('rx1').set({ patientId: 'p1', appointmentId: 'a1', followUpDate: '2026-11-03' })
  })
  const flag = async () => (await h.db.col('prescriptions').doc('rx1').get()).data().followUpReminderSent

  it('reminds the day before, with the clinic details, and does not send twice', async () => {
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(1)
    expect(send).toHaveBeenCalledWith('+919800000001', {
      patientName: 'Asha Rao', clinicName: 'Shah Clinic', doctorName: 'Shah', dateText: '03 Nov 2026',
      clinicPhone: '+919900000000', bookingUrl: 'https://shah.example.in',
    })
    expect(await flag()).toBe(true)
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(0)
    expect(send).toHaveBeenCalledOnce()
  })

  it('only fires for tomorrow, never today or later dates', async () => {
    await h.db.col('prescriptions').doc('rx1').update({ followUpDate: '2026-11-02' })
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(0)
    await h.db.col('prescriptions').doc('rx1').update({ followUpDate: '2026-11-05' })
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it("uses the clinic's own morning, not the server's", async () => {
    const at = (iso: string) => new Date(iso)
    expect(await processFollowUps(tenant, doctor, at('2026-11-02T02:30:00Z'), deps)).toBe(0) // 08:00 IST
    expect(await processFollowUps(tenant, doctor, at('2026-11-02T14:00:00Z'), deps)).toBe(0) // 19:30 IST
    expect(send).not.toHaveBeenCalled()
    // 03:45 UTC is 09:15 in Kolkata
    expect(await processFollowUps(tenant, doctor, at('2026-11-02T03:45:00Z'), deps)).toBe(1)
  })

  it('leaves the reminder pending when WhatsApp refuses, so the next run tries again', async () => {
    send.mockResolvedValueOnce(false)
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(0)
    expect(await flag()).toBeUndefined()
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(1)
  })

  it('skips a patient who has already booked a visit soon, and marks it done', async () => {
    await h.db.col('appointments').doc('a2').set({ patientId: 'p1', status: 'BOOKED', startTime: new Date('2026-11-03T05:30:00Z') })
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(0)
    expect(send).not.toHaveBeenCalled()
    expect(await flag()).toBe(true)
  })

  it('is not put off by a cancelled or far-off booking', async () => {
    await h.db.col('appointments').doc('a2').set({ patientId: 'p1', status: 'CANCELLED', startTime: new Date('2026-11-03T05:30:00Z') })
    await h.db.col('appointments').doc('a3').set({ patientId: 'p1', status: 'BOOKED', startTime: new Date('2026-12-20T05:30:00Z') })
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(1)
  })

  it('marks a patient with no phone as done instead of retrying forever', async () => {
    await h.db.col('patients').doc('p1').set({ name: 'No Phone' })
    expect(await processFollowUps(tenant, doctor, morning, deps)).toBe(0)
    expect(await flag()).toBe(true)
  })

  it('sends nothing for a clinic whose plan has WhatsApp or prescriptions switched off', async () => {
    expect(await processFollowUps({ ...tenant, features: { whatsapp: false } }, doctor, morning, deps)).toBe(0)
    expect(await processFollowUps({ ...tenant, features: { prescriptions: false } }, doctor, morning, deps)).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('falls back to the clinic website when no address is mapped', async () => {
    deps.bookingUrl = async () => null
    await processFollowUps(tenant, { ...doctor, websiteUrl: 'https://shah.clinic' }, morning, deps)
    expect(send.mock.calls[0][1].bookingUrl).toBe('https://shah.clinic')
  })
})

describe('patient prescriptions', () => {
  const NOW = new Date('2026-11-10T06:00:00Z')
  const phone = '+919800000001'
  const verified: PatientSession = { phone, accessId: accessIdFor(phone), verified: true }
  const unverified: PatientSession = { ...verified, verified: false }
  const day = (d: number) => new Date(Date.UTC(2026, 10, d, 5, 0))
  const t = (d: number) => ({ toDate: () => d as any })
  void t

  beforeEach(async () => {
    h.db = fakeTenantDb(new FakeFirestore())
    h.session = verified
    h.rendered.length = 0
    await h.db.col('patients').doc('p1').set({ name: 'Asha Rao', phone })
    await h.db.col('patients').doc('p2').set({ name: 'Other Person', phone: '+919811111111' })
    // a visit the clinic booked for her (no accessId), one she booked herself, a cancelled one, one for someone else, one without a prescription
    await h.db.col('appointments').doc('desk').set({ patientId: 'p1', status: 'COMPLETED', startTime: day(2) })
    await h.db.col('appointments').doc('self').set({ patientId: 'p1', status: 'COMPLETED', accessId: verified.accessId, startTime: day(5) })
    await h.db.col('appointments').doc('cancelled').set({ patientId: 'p1', status: 'CANCELLED', startTime: day(3) })
    await h.db.col('appointments').doc('theirs').set({ patientId: 'p2', status: 'COMPLETED', startTime: day(4) })
    await h.db.col('appointments').doc('norx').set({ patientId: 'p1', status: 'COMPLETED', startTime: day(6) })
    await h.db.col('appointments').doc('future').set({ patientId: 'p1', status: 'BOOKED', startTime: day(20) })
    for (const id of ['desk', 'self', 'cancelled', 'theirs', 'future']) {
      await h.db.col('prescriptions').doc(`rx-${id}`).set({ appointmentId: id, patientId: id === 'theirs' ? 'p2' : 'p1' })
    }
  })

  it('a verified PIN lists the prescriptions on its number, newest first, and nothing else', async () => {
    const visits = await listMyPrescriptions(tenant, verified, NOW)
    expect(visits.map(v => v.appointmentId)).toEqual(['self', 'desk'])
    expect(visits[0]).toMatchObject({ prescriptionId: 'rx-self', patientName: 'Asha Rao' })
  })

  it('an unverified PIN sees only visits booked under it', async () => {
    expect((await listMyPrescriptions(tenant, unverified, NOW)).map(v => v.appointmentId)).toEqual(['self'])
  })

  it('the list answers 401 without a session and never carries medical details', async () => {
    h.session = null
    expect((await listRoute()).status).toBe(401)
    h.session = verified
    const res = await listRoute()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toMatch(/diagnosis|medicines|notes|phone/i)
  })

  const download = (id: string) => pdfRoute(new Request('http://x'), { params: Promise.resolve({ appointmentId: id }) })

  it('downloads only a visit that belongs to the session', async () => {
    const own = await download('desk')
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toBe('application/pdf')
    expect(own.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(h.rendered).toEqual(['rx-desk'])
  })

  it('answers the same 404 for someone else\'s visit, a cancelled one, one with no prescription and one that does not exist', async () => {
    for (const id of ['theirs', 'cancelled', 'norx', 'nope']) {
      const res = await download(id)
      expect(res.status, id).toBe(404)
      expect(await res.json()).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
    }
    expect(h.rendered).toEqual([])
  })

  it('an unverified PIN cannot download a visit the clinic booked for the number', async () => {
    h.session = unverified
    expect((await download('desk')).status).toBe(404)
    expect((await download('self')).status).toBe(200)
  })

  it('needs a PIN session', async () => {
    h.session = null
    expect((await download('desk')).status).toBe(401)
  })

  it('limits downloads per patient', async () => {
    for (let i = 0; i < 30; i++) expect((await download('desk')).status).toBe(200)
    expect((await download('desk')).status).toBe(429)
  })

  it('a clinic without the prescriptions feature offers none', async () => {
    const mod = await import('@/lib/tenant/features')
    const spy = vi.spyOn(mod, 'featureGate').mockReturnValue(new Response(null, { status: 403 }))
    expect((await download('desk')).status).toBe(404)
    expect(await (await listRoute()).json()).toEqual({ visits: [] })
    spy.mockRestore()
  })
})
