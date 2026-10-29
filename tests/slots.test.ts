import { describe, it, expect } from 'vitest'
import { generateAvailableSlots, getWorkingWindowsForDay } from '@/lib/slots'
import type { WeeklyTimings } from '@/lib/constants'

const closed = { open: false, morning: null, evening: null }
const timings: WeeklyTimings = {
  monday: { open: true, morning: { start: '09:00', end: '11:00' }, evening: { start: '17:00', end: '18:00' } },
  tuesday: closed, wednesday: closed, thursday: closed, friday: closed, saturday: closed, sunday: closed,
}

const MONDAY = '2026-11-02'
const KOLKATA = 'Asia/Kolkata'
// Kolkata is UTC+5:30, so 09:00 IST is 03:30Z
const ist = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 2, h, m) - 5.5 * 3600_000)
const EARLY = ist(0, 5) // just after midnight, nothing has started yet

const labels = (opts: Partial<Parameters<typeof generateAvailableSlots>[0]> = {}) =>
  generateAvailableSlots({
    date: MONDAY, timezone: KOLKATA, timings, slotDurationMins: 30,
    blockedSlots: [], bookedSlots: [], now: EARLY, ...opts,
  }).map(s => s.label)

describe('generateAvailableSlots', () => {
  it('splits both shifts into slots of the configured length', () => {
    expect(labels()).toEqual(['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '05:00 PM', '05:30 PM'])
  })

  it('returns nothing on a closed day', () => {
    expect(labels({ date: '2026-11-03' })).toEqual([])
  })

  it('does not emit a slot that would run past the end of a shift', () => {
    expect(labels({ slotDurationMins: 45 })).toEqual(['09:00 AM', '09:45 AM', '05:00 PM'])
  })

  it('removes booked slots, and only those that overlap', () => {
    const out = labels({ bookedSlots: [{ startTime: ist(9, 30), endTime: ist(10) }] })
    expect(out).not.toContain('09:30 AM')
    expect(out).toContain('09:00 AM')
    expect(out).toContain('10:00 AM')
  })

  it('removes slots covered by a blocked range, including one spanning several slots', () => {
    expect(labels({ blockedSlots: [{ startTime: ist(9, 15), endTime: ist(10, 45) }] })).toEqual(['05:00 PM', '05:30 PM'])
  })

  it('hides slots that have already started', () => {
    expect(labels({ now: ist(10, 5) })).toEqual(['10:30 AM', '05:00 PM', '05:30 PM'])
  })

  it('is independent of the server timezone: a New York clinic gets New York hours', () => {
    const out = generateAvailableSlots({
      date: MONDAY, timezone: 'America/New_York', timings, slotDurationMins: 30,
      blockedSlots: [], bookedSlots: [], now: new Date('2026-11-01T00:00:00Z'),
    })
    // 09:00 EST (UTC-5 after the 1 Nov fall-back) is 14:00Z
    expect(out[0].start).toBe('2026-11-02T14:00:00.000Z')
    expect(out[0].label).toBe('09:00 AM')
  })

  it('labels slots in the clinic zone even for a patient abroad', () => {
    const [first] = generateAvailableSlots({
      date: MONDAY, timezone: 'Asia/Dubai', timings, slotDurationMins: 30, blockedSlots: [], bookedSlots: [], now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(first.start).toBe('2026-11-02T05:00:00.000Z') // 09:00 in Dubai (UTC+4)
    expect(first.label).toBe('09:00 AM')
  })

  it('handles the 25-hour DST day without losing or duplicating slots', () => {
    const dst: WeeklyTimings = { ...timings, sunday: { open: true, morning: { start: '00:30', end: '03:30' }, evening: null } }
    // 1 Nov 2026 is a Sunday; New York falls back at 02:00 (the 01:00–02:00 hour happens twice)
    const out = generateAvailableSlots({
      date: '2026-11-01', timezone: 'America/New_York', timings: dst, slotDurationMins: 60,
      blockedSlots: [], bookedSlots: [], now: new Date('2026-10-30T00:00:00Z'),
    })
    const starts = out.map(s => s.start)
    expect(new Set(starts).size).toBe(starts.length)
    // 00:30 → 03:30 wall-clock is four real hours on a fall-back day
    expect(out).toHaveLength(4)
  })
})

describe('getWorkingWindowsForDay', () => {
  it('returns the open shifts as real instants in the clinic zone', () => {
    const w = getWorkingWindowsForDay(MONDAY, timings, KOLKATA)
    expect(w).toHaveLength(2)
    expect(w[0].start.toISOString()).toBe('2026-11-02T03:30:00.000Z')
    expect(w[0].end.toISOString()).toBe('2026-11-02T05:30:00.000Z')
  })
  it('is empty on a closed day', () => {
    expect(getWorkingWindowsForDay('2026-11-03', timings, KOLKATA)).toEqual([])
  })
})
