import { prisma } from '@/lib/prisma'
import { generateAvailableSlots } from '@/lib/slots'
import { type NextRequest } from 'next/server'
import { startOfDay, endOfDay, format } from 'date-fns'
import type { WeeklyTimings } from '@/lib/constants'
import { sendWhatsApp } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email'

// GET /api/appointments?date=2024-01-15&patientPhone=xxx
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date')
    const patientPhone = request.nextUrl.searchParams.get('patientPhone')
    const mode = request.nextUrl.searchParams.get('mode') // 'slots' | 'patient'

    // Get doctor (single-doctor app)
    const doctor = await prisma.doctor.findFirst({
      select: {
        id: true,
        slotDurationMins: true,
        timings: true,
      },
    })

    if (!doctor) {
      return Response.json({ error: 'Clinic not configured' }, { status: 503 })
    }

    if (mode === 'slots' && date) {
      const targetDate = new Date(date)
      const dayStart = startOfDay(targetDate)
      const dayEnd = endOfDay(targetDate)

      const [blockedSlots, bookedSlots] = await Promise.all([
        prisma.blockedSlot.findMany({
          where: {
            doctorId: doctor.id,
            startTime: { gte: dayStart },
            endTime: { lte: dayEnd },
          },
        }),
        prisma.appointment.findMany({
          where: {
            doctorId: doctor.id,
            status: 'BOOKED',
            startTime: { gte: dayStart },
            endTime: { lte: dayEnd },
          },
        }),
      ])

      const slots = generateAvailableSlots({
        date: targetDate,
        timings: doctor.timings as unknown as WeeklyTimings,
        slotDurationMins: doctor.slotDurationMins,
        blockedSlots,
        bookedSlots,
      })

      return Response.json({ slots })
    }

    // Patient's appointments
    if (patientPhone) {
      const patient = await prisma.patient.findUnique({
        where: { phone: patientPhone },
      })

      if (!patient) {
        return Response.json({ appointments: [] })
      }

      const appointments = await prisma.appointment.findMany({
        where: {
          patientId: patient.id,
          status: 'BOOKED',
          startTime: { gte: new Date() },
        },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          chiefComplaint: true,
        },
      })

      return Response.json({ appointments })
    }

    return Response.json({ error: 'Invalid query parameters' }, { status: 400 })
  } catch (error) {
    console.error('[appointments-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/appointments — book an appointment
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { patientId, startTime, endTime, chiefComplaint } = body

    if (!patientId || !startTime || !endTime) {
      return Response.json({ error: 'patientId, startTime and endTime are required' }, { status: 400 })
    }

    const doctor = await prisma.doctor.findFirst({ select: { id: true } })
    if (!doctor) {
      return Response.json({ error: 'Clinic not configured' }, { status: 503 })
    }

    const start = new Date(startTime)
    const end = new Date(endTime)

    // Check for conflicts
    const conflict = await prisma.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        status: 'BOOKED',
        OR: [
          { startTime: { gte: start, lt: end } },
          { endTime: { gt: start, lte: end } },
          { startTime: { lte: start }, endTime: { gte: end } },
        ],
      },
    })

    if (conflict) {
      return Response.json({ error: 'This slot is no longer available' }, { status: 409 })
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: doctor.id,
        startTime: start,
        endTime: end,
        chiefComplaint: chiefComplaint?.trim() || null,
        status: 'BOOKED',
      },
      include: {
        patient: { select: { name: true, phone: true, email: true } },
        doctor: { select: { clinicName: true, name: true, phone: true } },
      },
    })

    // Fire & Forget notifications
    const dateStr = format(start, 'PPP')
    const timeStr = format(start, 'p')
    const clinicName = appointment.doctor.clinicName || 'Clinic'
    const msg = `Hi ${appointment.patient.name}, your appointment at ${clinicName} is confirmed for ${dateStr} at ${timeStr}.`

    Promise.all([
      sendWhatsApp(appointment.patient.phone, msg),
      appointment.patient.email ? sendEmail({
        to: appointment.patient.email,
        subject: 'Appointment Confirmed',
        html: `<p>${msg}</p>`
      }) : Promise.resolve(),
    ]).catch(err => console.error('[Notification Error]', err))

    return Response.json({ appointment }, { status: 201 })
  } catch (error) {
    console.error('[appointments-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
