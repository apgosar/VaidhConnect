import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateAvailableSlots } from '@/lib/slots'
import type { WeeklyTimings } from '@/lib/constants'

const closed = { open: false, morning: null, evening: null }
const timings: WeeklyTimings = {
  monday: { open: true, morning: { start: '09:00', end: '11:00' }, evening: { start: '17:00', end: '18:00' } },
  tuesday: closed, wednesday: closed, thursday: closed, friday: closed, saturday: closed, sunday: closed,
}

// Monday 2026-11-02, local (vitest pins TZ to Asia/Kolkata)
const monday = new Date(2026, 10, 2)
const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m)

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at(0, 5)) })
afterEach(() => vi.useRealTimers())

const labels = (opts: Partial<Parameters<typeof generateAvailableSlots>[0]> = {}) =>
  generateAvailableSlots({ date: monday, timings, slotDurationMins: 30, blockedSlots: [], bookedSlots: [], ...opts })
    .map(s => s.label)

describe('generateAvailableSlots', () => {
  it('splits both shifts into slots of the configured length', () => {
    expect(labels()).toEqual(['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '05:00 PM', '05:30 PM'])
  })

  it('returns nothing on a closed day', () => {
    expect(labels({ date: new Date(2026, 10, 3) })).toEqual([])
  })

  it('does not emit a slot that would run past the end of a shift', () => {
    expect(labels({ slotDurationMins: 45 })).toEqual(['09:00 AM', '09:45 AM', '05:00 PM'])
  })

  it('removes booked slots, and only those that overlap', () => {
    const out = labels({ bookedSlots: [{ startTime: at(9, 30), endTime: at(10) }] })
    expect(out).not.toContain('09:30 AM')
    expect(out).toContain('09:00 AM')
    expect(out).toContain('10:00 AM')
  })

  it('removes slots covered by a blocked range, including one spanning several slots', () => {
    const out = labels({ blockedSlots: [{ startTime: at(9, 15), endTime: at(10, 45) }] })
    expect(out).toEqual(['05:00 PM', '05:30 PM'])
  })

  it('hides slots that have already started', () => {
    vi.setSystemTime(at(10, 5))
    expect(labels()).toEqual(['10:30 AM', '05:00 PM', '05:30 PM'])
  })
})
