import { tenantDb } from '../db/tenant'
import { tenantHasFeature } from '../tenant/features'
import { clinicBookingUrl } from '../tenant/list'
import { sendFollowUpReminder } from '../whatsapp'
import { addDaysYmd, formatDateShortInTz, hourInTz, ymdInTz } from '../time'
import type { Tenant } from '../tenant/types'

/** Reminders go out in the clinic's morning, never overnight. */
export const FOLLOW_UP_FROM_HOUR = 9
export const FOLLOW_UP_UNTIL_HOUR = 19
/** A patient who has already booked within this many days of the follow-up needs no reminder. */
const ALREADY_BOOKED_DAYS = 4

export interface FollowUpDeps {
  bookingUrl: (tenant: Tenant) => Promise<string | null>
  send: typeof sendFollowUpReminder
}
const realDeps: FollowUpDeps = { bookingUrl: t => clinicBookingUrl(t.clinicId), send: sendFollowUpReminder }

/**
 * The day before a prescription's follow-up date, remind the patient on WhatsApp. Runs from the
 * regular 15-minute reminder job. Returns how many reminders were sent.
 *
 * A prescription is marked done only when the message went out (a failure is retried on the next run,
 * but only inside the morning window, so a broken template cannot repeat all night) or when the
 * patient has already booked, which makes the reminder pointless.
 */
export async function processFollowUps(tenant: Tenant, doctor: any, now = new Date(), deps: FollowUpDeps = realDeps): Promise<number> {
  if (!tenantHasFeature(tenant, 'whatsapp') || !tenantHasFeature(tenant, 'prescriptions')) return 0
  const hour = hourInTz(now, tenant.timezone)
  if (hour < FOLLOW_UP_FROM_HOUR || hour >= FOLLOW_UP_UNTIL_HOUR) return 0

  const db = tenantDb(tenant)
  const tomorrow = addDaysYmd(ymdInTz(now, tenant.timezone), 1)
  const due = (await db.col('prescriptions').where('followUpDate', '==', tomorrow).get()).docs
    .filter((d: any) => d.data().followUpReminderSent !== true)
  if (due.length === 0) return 0

  const bookingUrl = (await deps.bookingUrl(tenant)) ?? (doctor.websiteUrl as string | undefined) ?? 'our website'
  const clinicName = doctor.clinicName || 'Clinic'
  const dateText = formatDateShortInTz(new Date(`${tomorrow}T00:00:00Z`), 'UTC')
  let sent = 0

  for (const rx of due) {
    const patientSnap = await db.col('patients').doc(String(rx.data().patientId)).get()
    const patient = patientSnap.data() as { name?: string; phone?: string } | undefined
    if (!patient?.phone) { await rx.ref.update({ followUpReminderSent: true }); continue }

    // Already coming back soon? Then there is nothing to remind them about.
    const horizon = new Date(now.getTime() + ALREADY_BOOKED_DAYS * 86_400_000)
    const upcoming = (await db.col('appointments').where('patientId', '==', String(rx.data().patientId)).where('status', '==', 'BOOKED').get()).docs
      .some((a: any) => { const t = a.data().startTime.toDate(); return t >= now && t <= horizon })
    if (upcoming) { await rx.ref.update({ followUpReminderSent: true }); continue }

    const ok = await deps.send(patient.phone, {
      patientName: patient.name || 'Patient',
      clinicName,
      doctorName: doctor.name || 'Doctor',
      dateText,
      clinicPhone: doctor.phone || clinicName,
      bookingUrl,
    })
    if (ok) {
      await rx.ref.update({ followUpReminderSent: true })
      sent++
    }
  }
  return sent
}
