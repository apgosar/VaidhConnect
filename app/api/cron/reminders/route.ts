import { prisma } from '@/lib/prisma'
import { sendEmail, appointmentReminderHtml } from '@/lib/email'
import { sendWhatsApp, appointmentReminderMessage } from '@/lib/whatsapp'
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

    const doctor = await prisma.doctor.findFirst({
      select: {
        id: true,
        name: true,
        clinicName: true,
        phone: true,
        address: true,
        reminderIntervals: true,
      },
    })

    if (!doctor) {
      return Response.json({ message: 'No doctor configured' })
    }

    const intervals = (doctor.reminderIntervals as number[]) ?? [24, 1]
    const now = new Date()
    let remindersProcessed = 0

    for (const hoursBeforeAppt of intervals) {
      const windowStart = addHours(now, hoursBeforeAppt - 0.25) // 15 min window
      const windowEnd = addHours(now, hoursBeforeAppt + 0.25)

      const field = hoursBeforeAppt >= 12 ? 'reminderSent24h' : 'reminderSent1h'

      const appointments = await prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          status: 'BOOKED',
          startTime: { gte: windowStart, lte: windowEnd },
          [field]: false,
        },
        include: {
          patient: {
            select: { name: true, phone: true, email: true },
          },
        },
      })

      for (const appt of appointments) {
        const { patient } = appt
        const appointmentTime = formatDate(appt.startTime)

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
        await sendWhatsApp(patient.phone, appointmentReminderMessage(msgParams))

        // Mark reminder as sent
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { [field]: true },
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
