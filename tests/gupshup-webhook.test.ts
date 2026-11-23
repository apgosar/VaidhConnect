import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => {
  process.env.GUPSHUP_WEBHOOK_SECRET = 'sekret'
  return { db: null as any, index: {} as Record<string, any> }
})
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/whatsappInbox', () => ({ handleInboundMessage: vi.fn(async () => true) }))
vi.mock('@/lib/firebase/server', () => ({
  adminDb: { collection: () => ({ doc: (id: string) => ({ get: async () => ({ exists: !!h.index[id], data: () => h.index[id] }) }) }) },
}))

import { POST } from '@/app/api/webhooks/gupshup/[secret]/route'

const hit = (secret: string, body: unknown) =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ secret }) })
const ev = (type: string, extra: any = {}) => ({ type: 'message-event', payload: { gsId: 'gs-1', type, ...extra } })

describe('Gupshup delivery webhook', () => {
  beforeEach(async () => {
    h.db = fakeTenantDb(new FakeFirestore())
    h.index = { 'gs-1': { clinicId: 'c1', storage: 'scoped', logId: 'log1' } }
    await h.db.col('whatsapp_logs').doc('log1').set({ status: 'sent', templateName: 'appt_reminder' })
  })
  const log = async () => (await h.db.col('whatsapp_logs').doc('log1').get()).data()

  it('rejects a wrong secret', async () => {
    expect((await hit('nope', ev('delivered'))).status).toBe(404)
    expect((await log()).deliveryStatus).toBeUndefined()
  })

  it('records delivered then read, and never steps backwards', async () => {
    await hit('sekret', ev('delivered'))
    expect((await log()).deliveryStatus).toBe('delivered')
    await hit('sekret', ev('read'))
    expect((await log()).deliveryStatus).toBe('read')
    await hit('sekret', ev('delivered'))
    expect((await log()).deliveryStatus).toBe('read')
  })

  it('records the time of each step, even one that arrives late', async () => {
    await hit('sekret', ev('read', { payload: { ts: 1_700_000_100 } }))
    await hit('sekret', ev('delivered', { payload: { ts: 1_700_000_050 } }))
    const t = (await log()).deliveryTimes
    expect(t.read.getTime()).toBe(1_700_000_100_000)
    expect(t.delivered.getTime()).toBe(1_700_000_050_000)
    expect((await log()).deliveryStatus).toBe('read')
  })

  it('hands patient messages to the auto-reply', async () => {
    const { handleInboundMessage } = await import('@/lib/whatsappInbox')
    await hit('sekret', { type: 'message', payload: { source: '919800000001', type: 'text' } })
    expect(handleInboundMessage).toHaveBeenCalledWith('919800000001')
  })

  it('turns a failure into a failed log with a readable reason', async () => {
    await hit('sekret', ev('failed', { payload: { code: 1002, reason: 'x' } }))
    expect(await log()).toMatchObject({ status: 'failed', deliveryStatus: 'failed', errorDetail: 'That number is not on WhatsApp' })
  })

  it('accepts unknown messages and events without changing anything', async () => {
    expect((await hit('sekret', { type: 'message-event', payload: { gsId: 'other', type: 'read' } })).status).toBe(200)
    expect((await hit('sekret', ev('enqueued'))).status).toBe(200)
    expect((await log()).deliveryStatus).toBeUndefined()
  })
})
