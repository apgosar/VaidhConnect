import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
const gone = vi.hoisted(() => ({ files: [] as string[] }))
vi.mock('@/lib/storage', () => ({ deleteFile: async (p: string) => { gone.files.push(p) } }))

import { PUT, DELETE } from '@/app/api/patients/route'
import { audit } from '@/lib/audit'

let fs: FakeFirestore
const all = (c: string) => [...fs.coll(`clinics/c1/${c}`).values()] as any[]
const put = (body: unknown) => PUT(new Request('http://x/api/patients', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const del = (id: string) => DELETE(new Request(`http://x/api/patients?id=${id}`, { method: 'DELETE' }))

beforeEach(() => {
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs); h.session = { uid: 'u1', role: 'STAFF' }
  vi.mocked(audit).mockClear(); gone.files = []
  fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-06-01T00:00:00Z'), dobApproximate: true })
  fs.collection('clinics/c1/patients').doc('p2').set({ name: 'Mihir Rao', phone: '+919800000002', dob: new Date('2018-01-01T00:00:00Z') })
})

describe('editing a patient', () => {
  it('changes the name, number and date of birth, and keeps an exact date exact', async () => {
    const res = await put({ id: 'p1', name: ' Asha R. Rao ', phone: '98 00000009', dob: '1990-02-03', dobApproximate: false })
    expect(res.status).toBe(200)
    const p = all('patients').find(x => x.name === 'Asha R. Rao')
    expect(p).toMatchObject({ phone: '+919800000009', dobApproximate: false })
    expect(p.dob.toDate().toISOString()).toBe('1990-02-03T00:00:00.000Z')
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'patient.update', 'patients/p1')
  })

  it('refuses to turn one patient into a copy of another on the same number', async () => {
    const res = await put({ id: 'p2', name: 'Asha Rao', phone: '+919800000001' })
    expect(res.status).toBe(409)
    expect(all('patients').find(x => x.name === 'Mihir Rao')).toBeTruthy()
  })

  it('needs a login, and a patient that exists', async () => {
    expect((await put({ id: 'nope', name: 'Someone' })).status).toBe(404)
    h.session = null
    expect((await put({ id: 'p1', name: 'Asha Rao' })).status).toBe(401)
  })
})

describe('deleting a patient', () => {
  it('removes a patient who has no visits, and records it', async () => {
    expect((await del('p1')).status).toBe(200)
    expect(all('patients').map(p => p.name)).toEqual(['Mihir Rao'])
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'patient.delete', 'patients/p1', { visits: 0, prescriptions: 0, payments: 0 })
  })

  it('deletes a patient together with their visits, prescriptions, payments and scanned pages, and nobody else is touched', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    fs.collection('clinics/c1/appointments').doc('a1').set({ patientId: 'p1', rxScans: [{ id: 's1', path: 'rx-scans/a1/s1.jpg' }] })
    fs.collection('clinics/c1/appointments').doc('a2').set({ patientId: 'p2' })
    fs.collection('clinics/c1/prescriptions').doc('r1').set({ patientId: 'p1', appointmentId: 'a1' })
    fs.collection('clinics/c1/prescriptions').doc('r2').set({ patientId: 'p2', appointmentId: 'a2' })
    fs.collection('clinics/c1/payments').doc('y1').set({ appointmentId: 'a1', amount: 300 })
    fs.collection('clinics/c1/payments').doc('y2').set({ appointmentId: 'a2', amount: 300 })
    expect((await del('p1')).status).toBe(200)
    expect(all('patients').map(p => p.name)).toEqual(['Mihir Rao'])
    expect(all('appointments').map(a => a.patientId)).toEqual(['p2'])
    expect(all('prescriptions').map(r => r.patientId)).toEqual(['p2'])
    expect(all('payments')).toHaveLength(1)
    expect(gone.files).toEqual(['rx-scans/a1/s1.jpg'])
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'patient.delete', 'patients/p1', { visits: 1, prescriptions: 1, payments: 1 })
  })

  it('leaves the records alone when the front desk tries to delete a patient who has some', async () => {
    fs.collection('clinics/c1/appointments').doc('a1').set({ patientId: 'p1' })
    const res = await del('p1') // STAFF
    expect(res.status).toBe(403)
    expect(all('patients')).toHaveLength(2)
    expect(all('appointments')).toHaveLength(1)
  })

  it('needs a login and a patient that exists', async () => {
    expect((await del('nope')).status).toBe(404)
    h.session = null
    expect((await del('p1')).status).toBe(401)
    expect(all('patients')).toHaveLength(2)
  })
})
