import { addHours } from 'date-fns'
import { tenantDb } from '../db/tenant'
import { sendEmail, appointmentReminderHtml } from '../email'
import { emailAccent } from '../tenant/theme'
import { sendReminder } from '../whatsapp'
import { formatDateTimeInTz } from '../time'
import type { Tenant } from '../tenant/types'

/** Send due appointment reminders for ONE clinic. Returns how many were sent. */
export async function processReminders(tenant: Tenant, now = new Date()): Promise<number> {
  const db = tenantDb(tenant)
  const doctorDoc = await db.profile().get()
  if (!doctorDoc.exists) return 0
  const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

  const intervals = (doctor.reminderIntervals as number[]) ?? [24, 1]
  let sent = 0

  for (const hoursBeforeAppt of intervals) {
    const windowStart = hoursBeforeAppt <= 1 ? now : addHours(now, hoursBeforeAppt - 0.5)
    const windowEnd = hoursBeforeAppt <= 1 ? addHours(now, 1.25) : addHours(now, hoursBeforeAppt + 0.5)
    const field = hoursBeforeAppt >= 12 ? 'reminderSent24h' : 'reminderSent1h'

    const snap = await db.col('appointments')
      .where('doctorId', '==', doctor.id)
      .where('status', '==', 'BOOKED')
      .where('startTime', '>=', windowStart)
      .where('startTime', '<=', windowEnd)
      .get()

    const due = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() } as any))
      .filter((a: any) => !a[field])

    for (const appt of due) {
      const pDoc = appt.patientId ? await db.col('patients').doc(appt.patientId).get() : null
      if (!pDoc?.exists) continue
      const patient = pDoc.data() as any
      const appointmentTime = formatDateTimeInTz(appt.startTime.toDate(), tenant.timezone)

      if (patient.email) {
        await sendEmail({
          to: patient.email,
          subject: 'Reminder: Appointment in ' + hoursBeforeAppt + ' hour(s) — ' + doctor.clinicName,
          html: appointmentReminderHtml({
            patientName: patient.name,
            doctorName: doctor.name,
            clinicName: doctor.clinicName,
            appointmentTime,
            clinicPhone: doctor.phone ?? undefined,
            accentColor: emailAccent(doctor),
            clinicAddress: doctor.address ?? undefined,
          }),
        })
      }

      await sendReminder(patient.phone, {
        patientName: patient.name,
        doctorName: doctor.name || 'Doctor',
        appointmentTime,
        clinicPhone: doctor.phone || doctor.clinicName,
        directionsUrl: doctor.mapsUrl || 'Contact clinic for directions',
      })

      await db.col('appointments').doc(appt.id).update({ [field]: true, updatedAt: new Date() })
      sent++
    }
  }
  return sent
}
