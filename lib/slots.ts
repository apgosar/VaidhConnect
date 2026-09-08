import { format, addMinutes, parseISO, isBefore, isAfter, isEqual, isSameDay, startOfDay, endOfDay } from 'date-fns'
import type { WeeklyTimings, DayTiming, DayOfWeek } from './constants'

export interface TimeSlot {
  start: string // ISO datetime string
  end: string   // ISO datetime string
  label: string // e.g. "09:00 AM"
}

/**
 * The clinic's open shift(s) — as actual Date boundaries — on a given date.
 * Used to clip a (possibly multi-day) blocked period down to just the part
 * that overlaps real booking hours, so "doctor unavailable" messaging to
 * patients never shows a raw multi-day span (which reads as backwards
 * when only its time-of-day is displayed, e.g. "12:00 PM – 10:14 AM").
 */
export function getWorkingWindowsForDay(date: Date, timings: WeeklyTimings): Array<{ start: Date; end: Date }> {
  const dayName = format(date, 'EEEE').toLowerCase() as DayOfWeek
  const dayTiming: DayTiming = timings[dayName]
  if (!dayTiming?.open) return []

  const windows: Array<{ start: Date; end: Date }> = []
  const addWindow = (shiftStart?: string, shiftEnd?: string) => {
    if (!shiftStart || !shiftEnd) return
    const [startHour, startMin] = shiftStart.split(':').map(Number)
    const [endHour, endMin] = shiftEnd.split(':').map(Number)
    const start = new Date(date)
    start.setHours(startHour, startMin, 0, 0)
    const end = new Date(date)
    end.setHours(endHour, endMin, 0, 0)
    windows.push({ start, end })
  }
  addWindow(dayTiming.morning?.start, dayTiming.morning?.end)
  addWindow(dayTiming.evening?.start, dayTiming.evening?.end)
  return windows
}

/**
 * Generate all possible time slots for a given date based on clinic timings.
 * Then subtract blocked slots and already-booked appointments.
 */
export function generateAvailableSlots({
  date,
  timings,
  slotDurationMins,
  blockedSlots,
  bookedSlots,
}: {
  date: Date
  timings: WeeklyTimings
  slotDurationMins: number
  blockedSlots: Array<{ startTime: Date; endTime: Date }>
  bookedSlots: Array<{ startTime: Date; endTime: Date }>
}): TimeSlot[] {
  const dayName = format(date, 'EEEE').toLowerCase() as DayOfWeek
  const dayTiming: DayTiming = timings[dayName]

  if (!dayTiming?.open) return []

  const slots: TimeSlot[] = []

  const addSlotsForShift = (shiftStart: string, shiftEnd: string) => {
    const [startHour, startMin] = shiftStart.split(':').map(Number)
    const [endHour, endMin] = shiftEnd.split(':').map(Number)

    const dayStart = new Date(date)
    dayStart.setHours(startHour, startMin, 0, 0)

    const dayEnd = new Date(date)
    dayEnd.setHours(endHour, endMin, 0, 0)

    let current = new Date(dayStart)

    while (isBefore(current, dayEnd)) {
      const slotEnd = addMinutes(current, slotDurationMins)
      if (isAfter(slotEnd, dayEnd)) break

      const slotStart = new Date(current)

      // Check if slot conflicts with any blocked or booked slot
      const isBlocked = blockedSlots.some(block =>
        !(isEqual(slotEnd, block.startTime) || isBefore(slotEnd, block.startTime)) &&
        !(isEqual(slotStart, block.endTime) || isAfter(slotStart, block.endTime))
      )

      const isBooked = bookedSlots.some(booked =>
        !(isEqual(slotEnd, booked.startTime) || isBefore(slotEnd, booked.startTime)) &&
        !(isEqual(slotStart, booked.endTime) || isAfter(slotStart, booked.endTime))
      )

      const isPast = isBefore(slotStart, new Date())

      if (!isBlocked && !isBooked && !isPast) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: format(slotStart, 'hh:mm a'),
        })
      }

      current = addMinutes(current, slotDurationMins)
    }
  }

  if (dayTiming.morning?.start && dayTiming.morning?.end) {
    addSlotsForShift(dayTiming.morning.start, dayTiming.morning.end)
  }
  if (dayTiming.evening?.start && dayTiming.evening?.end) {
    addSlotsForShift(dayTiming.evening.start, dayTiming.evening.end)
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
