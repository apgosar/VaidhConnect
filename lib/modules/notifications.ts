import { tenantDb } from '../db/tenant'
import { sendBookingConfirmation, sendCancellation, sendReminder, sendSummaryUpdate } from '../whatsapp'
import { sendEmail, appointmentReminderHtml } from '../email'
import { emailAccent } from '../tenant/theme'
import { dayBoundsInTz, formatDateLongInTz, formatTimeInTz, hourInTz, ymdInTz } from '../time'
import type { Tenant } from '../tenant/types'

interface Doctor { id: string; [k: string]: any }
interface Patient { name: string; phone: string; email?: string | null }
interface Appt { startTime: Date }

const whenText = (tenant: Tenant, d: Date) =>
  `${formatDateLongInTz(d, tenant.timezone)} at ${formatTimeInTz(d, tenant.timezone)}`

/**
 * Booking confirmation (+ an immediate reminder if it's within the hour),
 * and the doctor's live schedule update. All times are in the clinic's own
 * timezone. Never throws: a failed message must not fail the booking.
 */
export async function notifyBooked(tenant: Tenant, doctor: Doctor, patient: Patient, appt: Appt) {
  try {
    const clinicName = doctor.clinicName || 'Clinic'
    const when = whenText(tenant, appt.startTime)
    const clinicPhone = doctor.phone || clinicName
    const hoursAway = (appt.startTime.getTime() - Date.now()) / 3_600_000

    const tasks: Promise<unknown>[] = [
      sendBookingConfirmation(patient.phone, {
        patientName: patient.name, doctorName: doctor.name || 'Doctor', appointmentTime: when, clinicPhone,
      }),
      patient.email
        ? sendEmail({ to: patient.email, subject: 'Appointment Confirmed', html: `<p>${escapeHtml(`Hi ${patient.name}, your appointment at ${clinicName} is confirmed for ${when}.`)}</p>` })
        : Promise.resolve(),
    ]

    if (hoursAway < 1) {
      tasks.push(sendReminder(patient.phone, {
        patientName: patient.name, doctorName: doctor.name || 'Doctor', appointmentTime: when, clinicPhone,
        directionsUrl: doctor.mapsUrl || 'Contact clinic for directions',
      }))
      if (patient.email) {
        tasks.push(sendEmail({
          to: patient.email,
          subject: `Reminder: Upcoming Appointment — ${clinicName}`,
          html: appointmentReminderHtml({
            patientName: patient.name, doctorName: doctor.name || 'Doctor', clinicName, appointmentTime: when,
            clinicPhone: doctor.phone ?? undefined,
            accentColor: emailAccent(doctor as any), clinicAddress: doctor.address ?? undefined,
          }),
        }))
      }
    }
    await Promise.all(tasks)
    await notifyDoctorScheduleUpdate(tenant, doctor, appt, `New booking: ${patient.name}`)
  } catch (err) {
    console.error('[notifyBooked]', err)
  }
}

export async function notifyCancelled(tenant: Tenant, doctor: Doctor, patient: Patient, appt: Appt) {
  try {
    const clinicName = doctor.clinicName || 'Clinic'
    const when = whenText(tenant, appt.startTime)
    const tasks: Promise<unknown>[] = [
      sendCancellation(patient.phone, { patientName: patient.name, appointmentTime: when, clinicPhone: doctor.phone || clinicName }),
    ]
    if (patient.email) {
      tasks.push(sendEmail({
        to: patient.email,
        subject: 'Appointment Cancelled',
        html: `<p>${escapeHtml(`Hi ${patient.name}, your appointment at ${clinicName} for ${when} has been cancelled.`)}</p>`,
      }))
    }
    await Promise.all(tasks)
    await notifyDoctorScheduleUpdate(tenant, doctor, appt, patient.name)
  } catch (err) {
    console.error('[notifyCancelled]', err)
  }
}

/**
 * For same-day changes made after the doctor's morning summary, send an
 * updated schedule. Before the summary hour the morning job covers it.
 */
export async function notifyDoctorScheduleUpdate(tenant: Tenant, doctor: Doctor, appt: Appt, change: string) {
  const now = new Date()
  if (ymdInTz(appt.startTime, tenant.timezone) !== ymdInTz(now, tenant.timezone)) return
  const summaryHour = typeof doctor.summaryHour === 'number' ? doctor.summaryHour : 10
  if (hourInTz(now, tenant.timezone) < summaryHour) return
  const notifyPhone = (doctor.whatsappPhone as string | undefined)?.trim() || (doctor.phone as string | undefined)?.trim()
  if (!notifyPhone) return

  const db = tenantDb(tenant)
  const { start, end } = dayBoundsInTz(now, tenant.timezone)
  const snap = await db.col('appointments')
    .where('doctorId', '==', doctor.id)
    .where('status', '==', 'BOOKED')
    .where('startTime', '>=', start)
    .where('startTime', '<=', end)
    .orderBy('startTime', 'asc')
    .get()

  const patients = await Promise.all(snap.docs.map(d => d.data().patientId ? db.col('patients').doc(d.data().patientId).get() : null))
  let scheduleList = ''
  snap.docs.forEach((d, i) => {
    const p = patients[i]?.data()
    scheduleList += `${formatTimeInTz(d.data().startTime.toDate(), tenant.timezone)} - ${p?.name || 'Unknown'} - ${p?.phone || ''}\n`
  })

  await sendSummaryUpdate(notifyPhone, {
    doctorName: doctor.name || 'Doctor',
    cancelledPatientName: change,
    remainingCount: snap.size.toString(),
    scheduleList: scheduleList.trim() || 'No remaining appointments.',
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
