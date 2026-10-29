import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any }))

vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))

import { POST } from '@/app/api/prescriptions/route'
import { GET as suggest } from '@/app/api/prescriptions/medicines/route'

// 10:00 on Mon 2 Nov 2026, Kolkata
const VISIT = new Date('2026-11-02T04:30:00Z')

const save = async (body: Record<string, unknown>) =>
  (await POST(new Request('http://x/api/prescriptions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appointmentId: 'a1', patientId: 'p1', medicines: [{ name: 'Paracetamol', dosage: '500 mg', frequency: 'BD', duration: '3 days' }], ...body }),
  })))!
const stored = async () => (await h.db.col('prescriptions').get()).docs.map((d: any) => d.data())

describe('saving a prescription', () => {
  beforeEach(async () => {
    h.db = fakeTenantDb(new FakeFirestore())
    h.session = { uid: 'u1', role: 'DOCTOR' }
    await h.db.col('appointments').doc('a1').set({ patientId: 'p1', startTime: VISIT })
  })

  it('keeps a valid follow-up date and marks its reminder as still to send', async () => {
    const res = await save({ followUpDate: '2026-11-09' })
    expect(res.status).toBe(201)
    expect((await stored())[0]).toMatchObject({ followUpDate: '2026-11-09', followUpReminderSent: false })
  })

  it('accepts the visit day itself and treats an empty date as none', async () => {
    expect((await save({ followUpDate: '2026-11-02' })).status).toBe(201)
    expect((await save({ followUpDate: '' })).status).toBe(201)
    expect((await stored())[0].followUpDate).toBeNull()
  })

  it('refuses nonsense, past and far-off dates', async () => {
    expect((await save({ followUpDate: '2026-02-31' })).status).toBe(400)
    expect((await save({ followUpDate: 'next week' })).status).toBe(400)
    expect((await save({ followUpDate: '2026-11-01' })).status).toBe(400)
    expect((await save({ followUpDate: '2029-01-01' })).status).toBe(400)
    expect(await stored()).toEqual([])
  })

  it('judges the visit day in the clinic timezone, not UTC', async () => {
    // 00:30 IST on 3 Nov is still 2 Nov in UTC
    await h.db.col('appointments').doc('a1').set({ patientId: 'p1', startTime: new Date('2026-11-02T19:00:00Z') })
    expect((await save({ followUpDate: '2026-11-03' })).status).toBe(201)
    expect((await save({ followUpDate: '2026-11-02' })).status).toBe(400)
  })

  it('re-arms the reminder only when the date changes', async () => {
    await save({ followUpDate: '2026-11-09' })
    const rx = (await h.db.col('prescriptions').get()).docs[0]
    await rx.ref.update({ followUpReminderSent: true })
    await save({ followUpDate: '2026-11-09', notes: 'edited' })
    expect((await stored())[0].followUpReminderSent).toBe(true)
    await save({ followUpDate: '2026-11-16' })
    expect((await stored())[0].followUpReminderSent).toBe(false)
  })

  it('remembers the medicines and suggests them afterwards', async () => {
    await save({})
    const res = await suggest(new Request('http://x/api/prescriptions/medicines?q=para'))
    expect(res.status).toBe(200)
    expect((await res.json()).medicines).toEqual([{ name: 'Paracetamol', dosage: '500 mg', frequency: 'BD', duration: '3 days', uses: 1 }])
  })

  it('does not inflate the use count when the same prescription is saved again', async () => {
    await save({}); await save({ notes: 'again' })
    expect((await (await suggest(new Request('http://x/x?q=para'))).json()).medicines[0].uses).toBe(1)
  })

  it('suggestions need a login and the prescriptions permission', async () => {
    h.session = null
    expect((await suggest(new Request('http://x/x?q=para'))).status).toBe(401)
    h.session = { uid: 'u2', role: 'STAFF' }
    expect((await suggest(new Request('http://x/x?q=para'))).status).toBe(403)
  })
})
