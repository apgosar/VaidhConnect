import { tenantDb } from '../db/tenant'
import { sendBookingConfirmation, sendCancellation, sendRescheduled, sendSummaryUpdate } from '../whatsapp'
import { sendEmail } from '../email'
import { dayBoundsInTz, formatDateLongInTz, formatTimeInTz, hourInTz, ymdInTz } from '../time'
import type { Tenant } from '../tenant/types'

interface Doctor { id: string; [k: string]: any }
interface Patient { name: string; phone: string; email?: string | null }
interface Appt { startTime: Date }

const whenText = (tenant: Tenant, d: Date) =>
  `${formatDateLongInTz(d, tenant.timezone)} at ${formatTimeInTz(d, tenant.timezone)}`

/**
 * Booking confirmation and the doctor's live schedule update. A booking made
 * within the hour gets only the confirmation: the reminder would arrive
 * seconds later and say the same thing (booking.ts marks it as already sent). All times are in the clinic's own
 * timezone. Never throws: a failed message must not fail the booking.
 */
export async function notifyBooked(tenant: Tenant, doctor: Doctor, patient: Patient, appt: Appt) {
  try {
    const clinicName = doctor.clinicName || 'Clinic'
    const when = whenText(tenant, appt.startTime)
    const clinicPhone = doctor.phone || clinicName

    const tasks: Promise<unknown>[] = [
      sendBookingConfirmation(patient.phone, {
        patientName: patient.name, clinicName, doctorName: doctor.name || 'Doctor', appointmentTime: when, clinicPhone,
      }),
      patient.email
        ? sendEmail({ to: patient.email, subject: 'Appointment Confirmed', html: `<p>${escapeHtml(`Hi ${patient.name}, your appointment at ${clinicName} is confirmed for ${when}.`)}</p>` })
        : Promise.resolve(),
    ]

    await Promise.all(tasks)
    await notifyDoctorScheduleUpdate(tenant, doctor, appt, `New booking by ${patient.name} for ${formatTimeInTz(appt.startTime, tenant.timezone)}`)
  } catch (err) {
    console.error('[notifyBooked]', err)
  }
}

export async function notifyCancelled(tenant: Tenant, doctor: Doctor, patient: Patient, appt: Appt) {
  try {
    const clinicName = doctor.clinicName || 'Clinic'
    const when = whenText(tenant, appt.startTime)
    const tasks: Promise<unknown>[] = [
      sendCancellation(patient.phone, { patientName: patient.name, clinicName, appointmentTime: when, clinicPhone: doctor.phone || clinicName }),
    ]
    if (patient.email) {
      tasks.push(sendEmail({
        to: patient.email,
        subject: 'Appointment Cancelled',
        html: `<p>${escapeHtml(`Hi ${patient.name}, your appointment at ${clinicName} for ${when} has been cancelled.`)}</p>`,
      }))
    }
    await Promise.all(tasks)
    await notifyDoctorScheduleUpdate(tenant, doctor, appt, `Cancellation by ${patient.name} for ${formatTimeInTz(appt.startTime, tenant.timezone)}`)
  } catch (err) {
    console.error('[notifyCancelled]', err)
  }
}

/** The patient is told their appointment moved (WhatsApp + email), and the doctor's live schedule is refreshed. */
export async function notifyRescheduled(tenant: Tenant, doctor: Doctor, patient: Patient, appt: Appt, previousStart: Date) {
  try {
    const clinicName = doctor.clinicName || 'Clinic'
    const when = whenText(tenant, appt.startTime)
    const was = whenText(tenant, previousStart)
    const tasks: Promise<unknown>[] = [
      sendRescheduled(patient.phone, { patientName: patient.name, clinicName, newTime: when, oldTime: was, clinicPhone: doctor.phone || clinicName }),
    ]
    if (patient.email) {
      tasks.push(sendEmail({
        to: patient.email,
        subject: 'Appointment Rescheduled',
        html: `<p>${escapeHtml(`Hi ${patient.name}, your appointment at ${clinicName} has been moved to ${when}. It was earlier scheduled for ${was}.`)}</p>`,
      }))
    }
    await Promise.all(tasks)
    // The doctor's schedule message covers today only: refresh it if either the old or the new time is today.
    const today = ymdInTz(new Date(), tenant.timezone)
    const touched = ymdInTz(appt.startTime, tenant.timezone) === today ? appt : ymdInTz(previousStart, tenant.timezone) === today ? { startTime: previousStart } : null
    if (touched) {
      await notifyDoctorScheduleUpdate(tenant, doctor, touched, `Rescheduled: ${patient.name} from ${formatTimeInTz(previousStart, tenant.timezone)} to ${formatTimeInTz(appt.startTime, tenant.timezone)}`)
    }
  } catch (err) {
    console.error('[notifyRescheduled]', err)
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
    clinicName: doctor.clinicName || 'Clinic',
    change,
    totalCount: snap.size.toString(),
    scheduleList: scheduleList.trim() || 'No remaining appointments.',
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
