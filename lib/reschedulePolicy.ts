/**
 * What a PATIENT may do when moving their own appointment. Clinic staff are never limited by these.
 * Kept in one place so the screen that offers the button and the server that enforces it agree.
 */
export const PATIENT_MAX_RESCHEDULES = 2
export const PATIENT_MIN_NOTICE_HOURS = 2

export interface RescheduleAllowance {
  allowed: boolean
  /** Why not, in words for the patient. Absent when allowed. */
  reason?: string
  /** How many more times they can move it. */
  left: number
}

export function patientRescheduleAllowance(appt: { startTime: Date; rescheduleCount?: number }, now = new Date()): RescheduleAllowance {
  const left = Math.max(0, PATIENT_MAX_RESCHEDULES - (appt.rescheduleCount ?? 0))
  if (left === 0) return { allowed: false, left, reason: `This appointment has already been moved ${PATIENT_MAX_RESCHEDULES} times. Please call the clinic to change it again.` }
  const hoursAway = (appt.startTime.getTime() - now.getTime()) / 3_600_000
  if (hoursAway < PATIENT_MIN_NOTICE_HOURS) {
    return { allowed: false, left, reason: `Appointments can be moved until ${PATIENT_MIN_NOTICE_HOURS} hours before the visit. Please call the clinic.` }
  }
  return { allowed: true, left }
}
