import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({
  db: null as any,
  session: null as any,
  patient: null as any,
  reschedule: null as any,
}))

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => tenant }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/auth/patientPin', () => ({ getPatientSession: async () => h.patient }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/lib/modules/booking', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/booking')>('@/lib/modules/booking')
  return { ...actual, rescheduleAppointment: (...a: any[]) => h.reschedule(...a) }
})

import { POST as reschedulePost } from '@/app/api/appointments/[id]/reschedule/route'
import { GET as blocksGet, POST as blocksPost, PATCH as blocksPatch, DELETE as blocksDelete } from '@/app/api/doctor/blocked-slots/route'
import { BookingError } from '@/lib/modules/booking'
import { audit } from '@/lib/audit'

const NOW = new Date('2026-11-05T04:30:00Z') // 10:00 IST, Thu 5 Nov 2026
const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const iso = (v: any) => (v?.toDate ? v.toDate() : v).toISOString()
let fs: FakeFirestore

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs)
  h.session = null; h.patient = null
  h.reschedule = vi.fn(async (_t: unknown, id: string) => ({ id, startTime: new Date(), endTime: new Date() }))
  vi.mocked(audit).mockClear()
})
afterEach(() => vi.useRealTimers())

const call = (id = 'a1', body: unknown = { startTime: '2026-11-06T04:00:00.000Z', endTime: '2026-11-06T04:30:00.000Z' }) =>
  reschedulePost(new Request(`http://x/api/appointments/${id}/reschedule`, json(body)), { params: Promise.resolve({ id }) })

describe('POST /api/appointments/[id]/reschedule', () => {
  it('needs a login of either kind', async () => {
    expect((await call()).status).toBe(401)
    expect(h.reschedule).not.toHaveBeenCalled()
  })

  it('lets signed-in staff move any appointment and records it', async () => {
    h.session = { uid: 'u1', role: 'STAFF' }
    const res = await call()
    expect(res.status).toBe(200)
    expect(h.reschedule.mock.calls[0][3]).toEqual({ kind: 'staff', uid: 'u1' })
    expect(audit).toHaveBeenCalledWith(tenant, h.session, 'appointment.reschedule', 'appointments/a1')
  })

  it('lets a PIN-signed-in patient move theirs (the server applies the limits)', async () => {
    h.patient = { phone: '+919800000001', accessId: 'acc1', verified: true }
    expect((await call()).status).toBe(200)
    expect(h.reschedule.mock.calls[0][3]).toEqual({ kind: 'patient', session: h.patient })
  })

  it('limits a patient to 10 attempts an hour', async () => {
    h.patient = { phone: '+919800000001', accessId: 'acc1', verified: true }
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200)
    const res = await call()
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('RATE_LIMITED')
  })

  it('passes on the engine\'s refusal with its status and code, never a 500', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    h.reschedule = vi.fn(async () => { throw new BookingError(409, 'This slot is no longer available', 'SLOT_TAKEN') })
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This slot is no longer available', code: 'SLOT_TAKEN' })
    h.reschedule = vi.fn(async () => { throw new BookingError(403, 'Not allowed') })
    expect((await call()).status).toBe(403)
  })

  it('answers 500 for an unexpected failure without leaking details', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.reschedule = vi.fn(async () => { throw new Error('firestore exploded: secret detail') })
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('secret')
  })

  it('rejects a malformed body before doing anything', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    expect((await call('a1', { startTime: 'tomorrow', endTime: 'later' })).status).toBe(400)
    expect((await call('a1', {})).status).toBe(400)
    expect(h.reschedule).not.toHaveBeenCalled()
  })
})

describe('/api/doctor/blocked-slots', () => {
  const owner = { uid: 'u1', role: 'OWNER' }
  const put = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
    fs.collection('clinics/c1/blocked_slots').doc(id).set({ doctorId: 'c1', startTime: new Date(start), endTime: new Date(end), reason: null, ...extra })
  const get = async (url: string): Promise<Response> => (await blocksGet(new Request(url))) as Response
  const send = async (method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Promise<Response> => {
    const handler = { POST: blocksPost, PATCH: blocksPatch, DELETE: blocksDelete }[method]
    const res = await handler(new Request('http://x/api/doctor/blocked-slots', { ...json(body), method }))
    return res as Response
  }

  it('is closed to the signed-out and to roles without the permission', async () => {
    expect((await get('http://x/api/doctor/blocked-slots')).status).toBe(401)
    expect((await send('POST', { start: '2026-11-06T10:00', end: '2026-11-06T11:00' })).status).toBe(401)
    h.session = { uid: 'u2', role: 'NOBODY' }
    expect((await get('http://x/api/doctor/blocked-slots')).status).toBe(403)
    expect((await send('DELETE', { id: 'x' })).status).toBe(403)
  })

  it('the page\'s list hides blocks that are over and tells the page the clinic\'s date and time', async () => {
    h.session = owner
    await put('old', '2026-11-04T04:00:00Z', '2026-11-04T08:00:00Z')
    await put('soon', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z')
    const body = await (await get('http://x/api/doctor/blocked-slots')).json()
    expect(body.blocks.map((b: any) => b.id)).toEqual(['soon'])
    expect(body.timezone).toBe('Asia/Kolkata')
    expect(body.today).toBe('2026-11-05')
    expect(body.nowLocal).toBe('2026-11-05T10:00')
  })

  it('the calendar\'s range query still returns every block overlapping the window, even past ones', async () => {
    h.session = owner
    await put('old', '2026-11-04T04:00:00Z', '2026-11-04T08:00:00Z')
    await put('long', '2026-10-30T04:00:00Z', '2026-11-08T04:00:00Z')
    await put('far', '2026-12-30T04:00:00Z', '2026-12-30T08:00:00Z')
    const url = `http://x/api/doctor/blocked-slots?from=${encodeURIComponent('2026-11-03T00:00:00Z')}&to=${encodeURIComponent('2026-11-09T00:00:00Z')}`
    const body = await (await get(url)).json()
    expect(body.blocks.map((b: any) => b.id).sort()).toEqual(['long', 'old'])
  })

  it('creates a block from what the form sends (clinic time), and warns about booked appointments', async () => {
    h.session = owner
    await fs.collection('clinics/c1/appointments').doc('a1').set({ doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-06T09:30:00Z'), endTime: new Date('2026-11-06T10:00:00Z') })
    const res = await send('POST', { start: '2026-11-06T14:30', end: '2026-11-06T16:00', reason: 'Surgery' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(new Date(body.block.startTime).toISOString()).toBe('2026-11-06T09:00:00.000Z')
    expect(body.conflicts.map((c: any) => c.id)).toEqual(['a1'])
    expect(audit).toHaveBeenCalledWith(tenant, owner, 'block.create', expect.stringMatching(/^blocks\//), { count: 1 })
  })

  it('still accepts the older startTime/endTime field names, including an ISO time with an offset', async () => {
    h.session = owner
    const res = await send('POST', { startTime: '2026-11-06T09:00:00Z', endTime: '2026-11-06T10:30:00Z' })
    expect(res.status).toBe(201)
    expect(new Date((await res.json()).block.startTime).toISOString()).toBe('2026-11-06T09:00:00.000Z')
  })

  it('creates a weekly series in one call', async () => {
    h.session = owner
    const body = await (await send('POST', { start: '2026-11-08T13:00', end: '2026-11-08T14:00', repeat: { until: '2026-11-22' } })).json()
    expect(body.blocks).toHaveLength(3)
    expect(new Set(body.blocks.map((b: any) => b.seriesId)).size).toBe(1)
  })

  it('answers bad input with a clear 400', async () => {
    h.session = owner
    for (const bad of [{ start: '2026-11-06T11:00', end: '2026-11-06T10:00' }, { start: 'x', end: 'y' }, { start: '2026-11-01T10:00', end: '2026-11-02T10:00' }, {}]) {
      const res = await send('POST', bad)
      expect(res.status, JSON.stringify(bad)).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
  })

  it('edits a block', async () => {
    h.session = owner
    await put('b1', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { reason: 'Old' })
    const res = await send('PATCH', { id: 'b1', start: '2026-11-07T10:00', end: '2026-11-07T12:00', reason: 'New' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(new Date(body.block.startTime).toISOString()).toBe('2026-11-07T04:30:00.000Z')
    expect(body.block.reason).toBe('New')
    expect(audit).toHaveBeenCalledWith(tenant, owner, 'block.update', 'blocks/b1')
    expect((await send('PATCH', { id: 'nope', start: '2026-11-07T10:00', end: '2026-11-07T12:00' })).status).toBe(404)
    expect((await send('PATCH', { id: 'b1', start: '2026-11-07T12:00', end: '2026-11-07T10:00' })).status).toBe(400)
  })

  it('deletes one block or the rest of a series', async () => {
    h.session = owner
    await put('a', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { seriesId: 's' })
    await put('b', '2026-11-13T04:00:00Z', '2026-11-13T08:00:00Z', { seriesId: 's' })
    await put('c', '2026-11-20T04:00:00Z', '2026-11-20T08:00:00Z', { seriesId: 's' })
    expect((await (await send('DELETE', { id: 'a' })).json()).removed).toBe(1)
    expect((await (await send('DELETE', { id: 'b', scope: 'series' })).json()).removed).toBe(2)
    expect([...fs.coll('clinics/c1/blocked_slots').keys()]).toEqual([])
    expect((await send('DELETE', { id: 'gone' })).status).toBe(404)
    expect((await send('DELETE', {})).status).toBe(400)
  })
})
