import { format, addMinutes, parseISO, isBefore, isAfter, isEqual, isSameDay, startOfDay, endOfDay } from 'date-fns'
import type { WeeklyTimings, DayTiming, DayOfWeek } from './constants'
import { dayNameOfYmd, formatSlotLabelInTz, zonedToUtc } from './time'

export interface TimeSlot {
  start: string // ISO datetime string
  end: string   // ISO datetime string
  label: string // e.g. "09:00 AM"
}

/**
 * The clinic's open shift(s) — as real UTC instants — on a given clinic-local
 * calendar date (YYYY-MM-DD). Used to clip a (possibly multi-day) blocked
 * period down to just the part that overlaps real booking hours.
 */
export function getWorkingWindowsForDay(
  ymd: string,
  timings: WeeklyTimings,
  timezone: string,
): Array<{ start: Date; end: Date }> {
  const dayTiming: DayTiming = timings[dayNameOfYmd(ymd) as DayOfWeek]
  if (!dayTiming?.open) return []

  const windows: Array<{ start: Date; end: Date }> = []
  const add = (s?: string, e?: string) => {
    if (!s || !e) return
    windows.push({ start: zonedToUtc(ymd, s, timezone), end: zonedToUtc(ymd, e, timezone) })
  }
  add(dayTiming.morning?.start, dayTiming.morning?.end)
  add(dayTiming.evening?.start, dayTiming.evening?.end)
  return windows
}

/**
 * All bookable slots on a clinic-local calendar date. Everything — shift
 * boundaries, the "already started" cut-off, the labels — is computed in the
 * CLINIC's timezone, never the server's, so the same code is correct for a
 * clinic in Kolkata, Dubai or New York regardless of where it runs.
 */
export function generateAvailableSlots({
  date,
  timezone,
  timings,
  slotDurationMins,
  blockedSlots,
  bookedSlots,
  now = new Date(),
}: {
  date: string // YYYY-MM-DD in the clinic's timezone
  timezone: string
  timings: WeeklyTimings
  slotDurationMins: number
  blockedSlots: Array<{ startTime: Date; endTime: Date }>
  bookedSlots: Array<{ startTime: Date; endTime: Date }>
  now?: Date
}): TimeSlot[] {
  if (!(slotDurationMins > 0)) return []
  const overlaps = (a: Date, b: Date, x: { startTime: Date; endTime: Date }) =>
    a < x.endTime && b > x.startTime

  const slots: TimeSlot[] = []
  const stepMs = slotDurationMins * 60_000

  for (const window of getWorkingWindowsForDay(date, timings, timezone)) {
    for (let t = window.start.getTime(); t + stepMs <= window.end.getTime(); t += stepMs) {
      const start = new Date(t)
      const end = new Date(t + stepMs)
      if (start < now) continue
      if (blockedSlots.some(x => overlaps(start, end, x))) continue
      if (bookedSlots.some(x => overlaps(start, end, x))) continue
      slots.push({ start: start.toISOString(), end: end.toISOString(), label: formatSlotLabelInTz(start, timezone) })
    }
  }
  return slots
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy, hh:mm a')
}

export function formatDateOnly(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy')
}

export function formatTimeOnly(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'hh:mm a')
}

/**
 * Compute age from date of birth
 */
export function computeAge(dob: Date | string): number {
  const birth = typeof dob === 'string' ? parseISO(dob) : dob
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

export function isMultiDayBlock(block: { startTime: Date; endTime: Date }): boolean {
  return !isSameDay(block.startTime, block.endTime)
}

/**
 * Doctor-facing label for a (possibly multi-day) blocked period, clipped
 * to how it applies on one specific calendar day. A raw multi-day
 * start/end reads as backwards once only its time-of-day is shown (e.g.
 * "12:00 PM – 10:14 AM" for a block that actually runs forward across 3
 * days), so days in the middle/edges of the span get "All day" / "From
 * X" / "Until X" instead of the block's real (out-of-context) boundary.
 */
export function formatBlockRangeForDay(block: { startTime: Date; endTime: Date }, day: Date): string {
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  const startsBeforeDay = block.startTime < dayStart
  const endsAfterDay = block.endTime > dayEnd
  if (startsBeforeDay && endsAfterDay) return 'All day'
  if (startsBeforeDay) return `Until ${format(block.endTime, 'hh:mm a')}`
  if (endsAfterDay) return `From ${format(block.startTime, 'hh:mm a')}`
  return `${format(block.startTime, 'hh:mm a')} – ${format(block.endTime, 'hh:mm a')}`
}

export { startOfDay, endOfDay }
