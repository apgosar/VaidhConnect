import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { sendWhatsApp } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email'
import { format } from 'date-fns'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        prescription: true,
        payment: true,
      },
    })

    if (!appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 })
    }

    return Response.json({ appointment })
  } catch (error) {
    console.error('[appointment-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, chiefComplaint, consultationNotes } = body

    // If changing status or notes, require auth
    const session = await auth()

    // Allow patient to cancel (no auth) — only allow CANCELLED status without auth
    if (status && status !== 'CANCELLED' && !session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(chiefComplaint !== undefined && { chiefComplaint }),
        ...(consultationNotes !== undefined && { consultationNotes }),
      },
      include: {
        patient: { select: { name: true, phone: true, email: true } },
        doctor: { select: { clinicName: true } },
      },
    })

    // If cancelled, send notification
    if (status === 'CANCELLED') {
      const dateStr = format(appointment.startTime, 'PPP')
      const timeStr = format(appointment.startTime, 'p')
      const clinicName = appointment.doctor.clinicName || 'Clinic'
      const msg = `Hi ${appointment.patient.name}, your appointment at ${clinicName} for ${dateStr} at ${timeStr} has been cancelled.`

      Promise.all([
        sendWhatsApp(appointment.patient.phone, msg),
        appointment.patient.email ? sendEmail({
          to: appointment.patient.email,
          subject: 'Appointment Cancelled',
          html: `<p>${msg}</p>`
        }) : Promise.resolve(),
      ]).catch(err => console.error('[Notification Error]', err))
    }

    return Response.json({ appointment })
  } catch (error) {
    console.error('[appointment-patch]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
