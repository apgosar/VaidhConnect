import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))

import { PUT, DELETE } from '@/app/api/patients/route'
import { audit } from '@/lib/audit'

let fs: FakeFirestore
const all = (c: string) => [...fs.coll(`clinics/c1/${c}`).values()] as any[]
const put = (body: unknown) => PUT(new Request('http://x/api/patients', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const del = (id: string) => DELETE(new Request(`http://x/api/patients?id=${id}`, { method: 'DELETE' }))

beforeEach(() => {
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs); h.session = { uid: 'u1', role: 'STAFF' }
  vi.mocked(audit).mockClear()
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
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'patient.delete', 'patients/p1')
  })

  it('keeps a patient who has a visit or a prescription, so medical records are never orphaned', async () => {
    fs.collection('clinics/c1/appointments').doc('a1').set({ patientId: 'p1', status: 'COMPLETED' })
    const res = await del('p1')
    expect(res.status).toBe(409)
    expect(typeof (await res.json()).error).toBe('string')
    expect(all('patients')).toHaveLength(2)

    fs.collection('clinics/c1/prescriptions').doc('r1').set({ patientId: 'p2', appointmentId: 'gone' })
    expect((await del('p2')).status).toBe(409)
    expect(all('patients')).toHaveLength(2)
  })

  it('needs a login and a patient that exists', async () => {
    expect((await del('nope')).status).toBe(404)
    h.session = null
    expect((await del('p1')).status).toBe(401)
    expect(all('patients')).toHaveLength(2)
  })
})
