import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
﻿import { sendEmail, appointmentReminderHtml } from '@/lib/email'
import { sendReminder } from '@/lib/whatsapp'
import { formatDate } from '@/lib/slots'
import { addHours, subHours } from 'date-fns'

// POST /api/cron/reminders â€” called by a cron job every 15 minutes
// Secured with a secret token. No fallback: if CRON_SECRET is unset, every
// request is rejected rather than silently accepting a value published in
// this repository's source.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorDoc = await db.profile().get()
    if (!doctorDoc.exists) {
      return Response.json({ message: 'No doctor configured' })
    }
    const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

    const intervals = (doctor.reminderIntervals as number[]) ?? [24, 1]
    const now = new Date()
    let remindersProcessed = 0

    for (const hoursBeforeAppt of intervals) {
      let windowStart: Date
      let windowEnd: Date

      if (hoursBeforeAppt <= 1) {
        windowStart = now
        windowEnd = addHours(now, 1.25)
      } else {
        windowStart = addHours(now, hoursBeforeAppt - 0.5)
        windowEnd = addHours(now, hoursBeforeAppt + 0.5)
      }

      const field = hoursBeforeAppt >= 12 ? 'reminderSent24h' : 'reminderSent1h'

      const appointmentsSnap = await db.col('appointments')
        .where('doctorId', '==', doctor.id)
        .where('status', '==', 'BOOKED')
        .where('startTime', '>=', windowStart)
        .where('startTime', '<=', windowEnd)
        .get()

      const appointments = appointmentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as any))
        .filter((apt: any) => !apt[field])

      for (const appt of appointments) {
        let patient: any = null
        if (appt.patientId) {
          const pDoc = await db.col('patients').doc(appt.patientId).get()
          if (pDoc.exists) patient = pDoc.data()
        }

        if (!patient) continue

        const appointmentTime = formatDate(appt.startTime.toDate())

        const msgParams = {
          patientName: patient.name,
          doctorName: doctor.name,
          clinicName: doctor.clinicName,
          appointmentTime,
          clinicPhone: doctor.phone ?? undefined,
        }

        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: 'Reminder: Appointment in ' + hoursBeforeAppt + ' hour(s) â€” ' + doctor.clinicName,
            html: appointmentReminderHtml({
              ...msgParams,
              clinicAddress: doctor.address ?? undefined,
            }),
          })
        }

        const clinicPhone = doctor.phone || doctor.clinicName
        await sendReminder(patient.phone, {
          patientName: patient.name,
          doctorName: doctor.name || 'Doctor',
          appointmentTime: appointmentTime,
          clinicPhone: clinicPhone,
          directionsUrl: doctor.mapsUrl || 'Contact clinic for directions'
        })

        await db.col('appointments').doc(appt.id).update({
          [field]: true,
          updatedAt: new Date(),
        })

        remindersProcessed++
      }
    }

    return Response.json({ message: 'Processed ' + remindersProcessed + ' reminders' })
  } catch (error) {
    console.error('[cron-reminders]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
