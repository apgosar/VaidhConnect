import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ store: {} as Record<string, any>, profiles: {} as Record<string, any>, sent: [] as any[] }))
vi.mock('@/lib/firebase/server', () => ({
  adminDb: { collection: () => ({ doc: (id: string) => ({
    get: async () => ({ exists: id in h.store, data: () => h.store[id] }),
    set: async (d: any, o?: any) => {
      if (o?.merge) { const cur = h.store[id] ?? {}; h.store[id] = { ...cur, ...d, clinics: { ...(cur.clinics ?? {}), ...(d.clinics ?? {}) } } } else h.store[id] = d
    },
  }) }) },
}))
vi.mock('@/lib/db/tenant', () => ({
  tenantDb: (t: any) => ({ profile: () => ({ get: async () => ({ exists: !!h.profiles[t.clinicId], data: () => h.profiles[t.clinicId] }) }) }),
}))
vi.mock('@/lib/whatsapp', () => ({ sendSessionText: async (to: string, text: string) => { h.sent.push({ to, text }); return { ok: true } } }))

import { rememberRecipient, handleInboundMessage, autoReplyText } from '@/lib/whatsappInbox'

describe('automatic reply to patient messages', () => {
  beforeEach(() => {
    h.store = {}; h.sent = []
    h.profiles = {
      a: { clinicName: 'Shah Clinic', phones: ['+91 99000 00000'] },
      b: { clinicName: 'Sheth Homecare', phone: '+91 98111 11111' },
    }
  })

  it('points a patient of one clinic to that clinic', async () => {
    await rememberRecipient('+919800000001', 'a', 'scoped')
    expect(await handleInboundMessage('919800000001')).toBe(true)
    expect(h.sent[0].to).toBe('919800000001')
    expect(h.sent[0].text).toContain('Shah Clinic on +91 99000 00000')
    expect(h.sent[0].text).not.toContain('Sheth')
  })

  it('lists both clinics when the same number is a patient at two', async () => {
    await rememberRecipient('+919800000001', 'a', 'scoped')
    await rememberRecipient('+919800000001', 'b', 'scoped')
    await handleInboundMessage('919800000001')
    expect(h.sent[0].text).toContain('Shah Clinic on +91 99000 00000')
    expect(h.sent[0].text).toContain('Sheth Homecare on +91 98111 11111')
  })

  it('replies only once a day to the same number', async () => {
    await rememberRecipient('+919800000001', 'a', 'scoped')
    const now = new Date()
    expect(await handleInboundMessage('919800000001', now)).toBe(true)
    expect(await handleInboundMessage('919800000001', new Date(now.getTime() + 3_600_000))).toBe(false)
    expect(await handleInboundMessage('919800000001', new Date(now.getTime() + 25 * 3_600_000))).toBe(true)
    expect(h.sent).toHaveLength(2)
  })

  it('still answers a number we never messaged, without naming a clinic', async () => {
    await handleInboundMessage('919811111111')
    expect(h.sent[0].text).toContain('contact your clinic directly')
  })

  it('says replies are not read', () => {
    expect(autoReplyText([])).toContain('not read')
  })
})
