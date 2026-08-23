import { adminDb } from '@/lib/firebase/server'
import { sendEmail, appointmentReminderHtml } from '@/lib/email'
import { sendReminder } from '@/lib/whatsapp'
import { formatDate } from '@/lib/slots'
import { addHours, subHours } from 'date-fns'

// POST /api/cron/reminders — called by a cron job every 15 minutes
// Secured with a secret token
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET ?? 'dev-cron-secret'

    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
    if (doctorsSnap.empty) {
      return Response.json({ message: 'No doctor configured' })
    }
    
    const doctorDoc = doctorsSnap.docs[0]
    const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

    const intervals = (doctor.reminderIntervals as number[]) ?? [24, 1]
    const now = new Date()
    let remindersProcessed = 0

    for (const hoursBeforeAppt of intervals) {
      const windowStart = addHours(now, hoursBeforeAppt - 0.25) // 15 min window
      const windowEnd = addHours(now, hoursBeforeAppt + 0.25)

      const field = hoursBeforeAppt >= 12 ? 'reminderSent24h' : 'reminderSent1h'

      // Firestore allows only one field for inequality filters, so filter `field` in memory
      const appointmentsSnap = await adminDb.collection('appointments')
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
          const pDoc = await adminDb.collection('patients').doc(appt.patientId).get()
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

        // Send Email
        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: `Reminder: Appointment in ${hoursBeforeAppt} hour(s) — ${doctor.clinicName}`,
            html: appointmentReminderHtml({
              ...msgParams,
              clinicAddress: doctor.address ?? undefined,
            }),
          })
        }

        // Send WhatsApp
        const clinicPhone = doctor.phone || doctor.clinicName
        await sendReminder(patient.phone, {
          patientName: patient.name,
          doctorName: doctor.name || 'Doctor',
          appointmentTime: appointmentTime,
          clinicPhone: clinicPhone,
          directionsUrl: doctor.mapsUrl || 'Contact clinic for directions'
        })

        // Mark reminder as sent
        await adminDb.collection('appointments').doc(appt.id).update({
          [field]: true,
          updatedAt: new Date(),
        })

        remindersProcessed++
      }
    }

    return Response.json({ message: `Processed ${remindersProcessed} reminders` })
  } catch (error) {
    console.error('[cron-reminders]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
