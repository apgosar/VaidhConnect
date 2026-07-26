import { format, addMinutes, parseISO, isBefore, isAfter, isEqual, startOfDay, endOfDay } from 'date-fns'
import type { WeeklyTimings, DayTiming, DayOfWeek } from './constants'

export interface TimeSlot {
  start: string // ISO datetime string
  end: string   // ISO datetime string
  label: string // e.g. "09:00 AM"
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

      // Don't show slots in the past
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

export { startOfDay, endOfDay }
