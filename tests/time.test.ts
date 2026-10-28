import { describe, it, expect } from 'vitest'
import { dayBoundsInTz, formatDateTimeInTz, formatTimeInTz, hourInTz, ymdInTz } from '@/lib/time'

// 2026-10-28T22:30:00Z is 04:00 on the 29th in Kolkata (UTC+5:30)
const instant = new Date('2026-10-28T22:30:00Z')

describe('clinic-timezone helpers', () => {
  it('reads the local hour and date in the clinic zone, not the server zone', () => {
    expect(hourInTz(instant, 'Asia/Kolkata')).toBe(4)
    expect(ymdInTz(instant, 'Asia/Kolkata')).toBe('2026-10-29')
    expect(ymdInTz(instant, 'America/New_York')).toBe('2026-10-28')
    expect(hourInTz(instant, 'America/New_York')).toBe(18)
  })

  it('bounds the local day correctly for a half-hour offset zone', () => {
    const { start, end } = dayBoundsInTz(instant, 'Asia/Kolkata')
    expect(start.toISOString()).toBe('2026-10-28T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-10-29T18:29:59.999Z')
  })

  it('handles a DST change inside the day (US fall-back, 25-hour day)', () => {
    const { start, end } = dayBoundsInTz(new Date('2026-11-01T12:00:00Z'), 'America/New_York')
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-02T04:59:59.999Z')
    expect((end.getTime() + 1 - start.getTime()) / 3_600_000).toBe(25)
  })

  it('formats times as a patient would read them', () => {
    expect(formatTimeInTz(new Date('2026-10-28T04:30:00Z'), 'Asia/Kolkata')).toBe('10:00 AM')
    expect(formatDateTimeInTz(new Date('2026-10-28T04:30:00Z'), 'Asia/Kolkata')).toBe('28 Oct 2026, 10:00 AM')
  })
})
