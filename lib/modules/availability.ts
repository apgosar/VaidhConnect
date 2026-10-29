import type { TenantDb } from '../db/tenant'
import type { Tenant } from '../tenant/types'
import type { WeeklyTimings } from '../constants'
import { generateAvailableSlots, getWorkingWindowsForDay, type TimeSlot } from '../slots'
import { dayBoundsInTz } from '../time'
import { zonedToUtc } from '../time'

export interface BlockedPeriod {
  startTime: string
  endTime: string
  reason: string | null
}

export interface DayAvailability {
  slots: TimeSlot[]
  blockedPeriods: BlockedPeriod[]
  slotDurationMins: number
}

/**
 * Bookable slots for one clinic-local calendar day (YYYY-MM-DD), with the
 * periods the doctor has blocked out clipped to real working hours so
 * patients can see *why* time is missing.
 */
export async function getDayAvailability(
  tenant: Tenant,
  db: TenantDb,
  doctor: { id: string; timings: WeeklyTimings; slotDurationMins: number },
  ymd: string,
  now = new Date(),
): Promise<DayAvailability> {
  const dayStart = zonedToUtc(ymd, '00:00', tenant.timezone)
  const dayEnd = dayBoundsInTz(dayStart, tenant.timezone).end

  // Each query has a single inequality field (no composite index needed).
  // Blocks are fetched by END time so a multi-day block still shows on every
  // day it covers, while long-finished blocks are never read.
  const [blockedSnap, bookedSnap] = await Promise.all([
    db.col('blocked_slots').where('endTime', '>=', dayStart).get(),
    db.col('appointments').where('startTime', '>=', dayStart).where('startTime', '<=', dayEnd).get(),
  ])

  const blockedSlots = blockedSnap.docs
    .map(d => d.data() as any)
    .map(d => ({ ...d, startTime: d.startTime.toDate() as Date, endTime: d.endTime.toDate() as Date }))
    .filter(b => b.doctorId === doctor.id && b.startTime <= dayEnd)

  const bookedSlots = bookedSnap.docs
    .map(d => d.data() as any)
    .filter(a => a.doctorId === doctor.id && a.status === 'BOOKED')
    .map(a => ({ startTime: a.startTime.toDate() as Date, endTime: a.endTime.toDate() as Date }))

  const slots = generateAvailableSlots({
    date: ymd,
    timezone: tenant.timezone,
    timings: doctor.timings,
    slotDurationMins: doctor.slotDurationMins,
    blockedSlots,
    bookedSlots,
    now,
  })

  const blockedPeriods: BlockedPeriod[] = []
  for (const b of blockedSlots) {
    for (const w of getWorkingWindowsForDay(ymd, doctor.timings, tenant.timezone)) {
      const s = b.startTime > w.start ? b.startTime : w.start
      const e = b.endTime < w.end ? b.endTime : w.end
      if (s < e) blockedPeriods.push({ startTime: s.toISOString(), endTime: e.toISOString(), reason: b.reason ?? null })
    }
  }

  return { slots, blockedPeriods, slotDurationMins: doctor.slotDurationMins }
}
