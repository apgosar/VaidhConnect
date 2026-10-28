import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- fake clinic data behind tenantDb ----
let profile: Record<string, any> | null
let appointments: any[]
const profileUpdates: any[] = []

vi.mock('@/lib/db/tenant', () => ({
  tenantDb: () => ({
    profile: () => ({
      get: async () => ({ exists: !!profile, id: 'clinic1', data: () => profile }),
      update: async (u: any) => { profileUpdates.push(u); Object.assign(profile!, u) },
    }),
    col: (name: string) => {
      if (name === 'appointments') {
        const q: any = {
          where: () => q, orderBy: () => q,
          get: async () => ({
            size: appointments.length,
            docs: appointments.map(a => ({ data: () => ({ patientId: 'p1', startTime: { toDate: () => a } }) })),
          }),
        }
        return q
      }
      return { doc: () => ({ get: async () => ({ data: () => ({ name: 'Asha', phone: '+919800000001' }) }) }) }
    },
  }),
}))

const sendDailySummary = vi.fn()
vi.mock('@/lib/whatsapp', () => ({ sendDailySummary: (...a: any[]) => sendDailySummary(...a) }))

import { processDailySummary } from '@/lib/modules/dailySummary'

const kolkata = { clinicId: 'clinic1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
// 10:15 in Kolkata on 28 Oct 2026
const at1015 = new Date('2026-10-28T04:45:00Z')

beforeEach(() => {
  profileUpdates.length = 0
  sendDailySummary.mockReset().mockResolvedValue(true)
  profile = { name: 'Shah', phone: '+919900000000', summaryHour: 10 }
  appointments = [new Date('2026-10-28T05:30:00Z')] // 11:00 AM local
})

describe('processDailySummary', () => {
  it('sends once the clinic-local summary hour arrives, and records the day', async () => {
    expect(await processDailySummary(kolkata, at1015)).toBe('sent')
    expect(sendDailySummary).toHaveBeenCalledOnce()
    expect(sendDailySummary.mock.calls[0][0]).toBe('+919900000000')
    expect(sendDailySummary.mock.calls[0][1]).toMatchObject({ appointmentCount: '1', date: 'October 28, 2026' })
    expect(sendDailySummary.mock.calls[0][1].scheduleList).toContain('11:00 AM - Asha')
    expect(profileUpdates).toEqual([{ lastDailySummaryOn: '2026-10-28' }])
  })

  it('does not send before the summary hour, in the clinic\'s zone', async () => {
    // 04:45 UTC is 10:15 in Kolkata but 00:45 in New York
    const ny = { ...kolkata, timezone: 'America/New_York' }
    expect(await processDailySummary(ny, at1015)).toBe('not-due')
    expect(sendDailySummary).not.toHaveBeenCalled()
  })

  it('sends at most once per local day', async () => {
    await processDailySummary(kolkata, at1015)
    expect(await processDailySummary(kolkata, new Date(at1015.getTime() + 15 * 60_000))).toBe('already-sent')
    expect(sendDailySummary).toHaveBeenCalledOnce()
  })

  it('catches up a missed tick within two hours, but not after that', async () => {
    expect(await processDailySummary(kolkata, new Date('2026-10-28T06:30:00Z'))).toBe('sent') // 12:00 local
    profile!.lastDailySummaryOn = undefined
    expect(await processDailySummary(kolkata, new Date('2026-10-28T08:00:00Z'))).toBe('not-due') // 13:30 local
  })

  it('does NOT record the day when the send fails, so the next tick retries', async () => {
    sendDailySummary.mockResolvedValue(false)
    await expect(processDailySummary(kolkata, at1015)).rejects.toThrow()
    expect(profileUpdates).toEqual([])
    sendDailySummary.mockResolvedValue(true)
    expect(await processDailySummary(kolkata, at1015)).toBe('sent')
  })

  it('reports clinics it cannot notify instead of failing', async () => {
    profile = { name: 'Shah', summaryHour: 10 }
    expect(await processDailySummary(kolkata, at1015)).toBe('no-phone')
    profile = null
    expect(await processDailySummary(kolkata, at1015)).toBe('no-clinic')
  })

  it('prefers the private WhatsApp number over the clinic phone', async () => {
    profile!.whatsappPhone = '+919811111111'
    await processDailySummary(kolkata, at1015)
    expect(sendDailySummary.mock.calls[0][0]).toBe('+919811111111')
  })
})
