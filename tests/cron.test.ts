import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/firebase/server', () => ({ adminDb: {} }))

const listTenants = vi.fn()
vi.mock('@/lib/tenant/list', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenant/list')>('@/lib/tenant/list')
  return { ...actual, listTenants: () => listTenants() }
})

import { cronAuthorized, runForAllClinics } from '@/lib/cron'
import { currentTenant } from '@/lib/tenant/context'

const tenant = (id: string) => ({ clinicId: id, storage: 'scoped' as const, timezone: 'Asia/Kolkata' })
const req = (auth?: string) => new Request('http://x', { headers: auth ? { authorization: auth } : {} })

describe('cronAuthorized', () => {
  const saved = process.env.CRON_SECRET
  afterEach(() => { process.env.CRON_SECRET = saved })

  it('rejects everything when CRON_SECRET is unset (no default secret)', () => {
    delete process.env.CRON_SECRET
    expect(cronAuthorized(req('Bearer undefined'))).toBe(false)
    expect(cronAuthorized(req('Bearer dev-cron-secret'))).toBe(false)
    expect(cronAuthorized(req())).toBe(false)
  })

  it('accepts only the exact bearer token', () => {
    process.env.CRON_SECRET = 's3cret'
    expect(cronAuthorized(req('Bearer s3cret'))).toBe(true)
    expect(cronAuthorized(req('Bearer s3cre'))).toBe(false)
    expect(cronAuthorized(req('s3cret'))).toBe(false)
  })
})

describe('runForAllClinics', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('runs every clinic even when one fails, and reports the failure', async () => {
    listTenants.mockResolvedValue(['a', 'b', 'c'].map(tenant))
    const out = await runForAllClinics(async t => {
      if (t.clinicId === 'b') throw new Error('bad WhatsApp token')
      return t.clinicId.toUpperCase()
    })
    expect(out.clinics).toBe(3)
    expect(out.failed).toBe(1)
    expect(out.results.find(r => r.clinicId === 'b')).toMatchObject({ ok: false, error: 'bad WhatsApp token' })
    expect(out.results.filter(r => r.ok).map(r => r.result).sort()).toEqual(['A', 'C'])
  })

  it('gives each job its own clinic in context, with no leakage between clinics', async () => {
    listTenants.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(tenant))
    const seen: Array<[string, string | undefined]> = []
    await runForAllClinics(async t => {
      await new Promise(r => setTimeout(r, Math.random() * 10))
      seen.push([t.clinicId, currentTenant()?.clinicId])
    })
    expect(seen).toHaveLength(7)
    for (const [expected, actual] of seen) expect(actual).toBe(expected)
  })

  it('handles zero clinics', async () => {
    listTenants.mockResolvedValue([])
    expect(await runForAllClinics(async () => 1)).toMatchObject({ clinics: 0, failed: 0 })
  })
})
