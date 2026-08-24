import { adminDb } from '@/lib/firebase/server'
import { generateAvailableSlots } from '@/lib/slots'
import { type NextRequest } from 'next/server'
import { startOfDay, endOfDay, format } from 'date-fns'
import type { WeeklyTimings } from '@/lib/constants'
import { sendBookingConfirmation } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email'

// GET /api/appointments?date=2024-01-15&patientPhone=xxx
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date')
    const patientId = request.nextUrl.searchParams.get('patientId')
    const mode = request.nextUrl.searchParams.get('mode') // 'slots' | 'patient'

    // Get doctor (single-doctor app)
    const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
    if (doctorsSnap.empty) {
      return Response.json({ error: 'Clinic not configured' }, { status: 503 })
    }
    const doctorDoc = doctorsSnap.docs[0]
    const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

    if (mode === 'slots' && date) {
      const targetDate = new Date(date)
      const dayStart = startOfDay(targetDate)
      const dayEnd = endOfDay(targetDate)

      // Firestore only allows inequality on one field, so we query by startTime
      // We filter doctorId and status in memory to avoid needing composite indexes (since it's a single-clinic app anyway)
      const [blockedSlotsSnap, bookedSlotsSnap] = await Promise.all([
        adminDb.collection('blocked_slots')
          .where('startTime', '>=', dayStart)
          .where('startTime', '<=', dayEnd)
          .get(),
        adminDb.collection('appointments')
          .where('startTime', '>=', dayStart)
          .where('startTime', '<=', dayEnd)
          .get(),
      ])

      const blockedSlots = blockedSlotsSnap.docs
        .map((doc: any) => {
          const data = doc.data()
          return { ...data, startTime: data.startTime.toDate(), endTime: data.endTime.toDate() }
        })
        .filter(slot => slot.doctorId === doctor.id)

      const bookedSlots = bookedSlotsSnap.docs
        .map((doc: any) => {
          const data = doc.data()
          return { ...data, startTime: data.startTime.toDate(), endTime: data.endTime.toDate() }
        })
        .filter(slot => slot.doctorId === doctor.id && slot.status === 'BOOKED')

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
    if (patientId) {
      const patientDoc = await adminDb.collection('patients').doc(patientId).get()
      if (!patientDoc.exists) {
        return Response.json({ appointments: [] })
      }

      const appointmentsSnap = await adminDb.collection('appointments')
        .where('patientId', '==', patientId)
        .where('status', '==', 'BOOKED')
        .where('startTime', '>=', new Date())
        .orderBy('startTime', 'asc')
        .get()

      const appointments = appointmentsSnap.docs.map((doc: any) => {
        const data = doc.data()
        return {
          id: doc.id,
          startTime: data.startTime.toDate(),
          endTime: data.endTime.toDate(),
          status: data.status,
          chiefComplaint: data.chiefComplaint,
        }
      })

      return Response.json({ appointments })
    }

    return Response.json({ error: 'Invalid query parameters' }, { status: 400 })
  } catch (error: any) {
    console.error('[appointments-get]', error)
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 })
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

    const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
    if (doctorsSnap.empty) {
      return Response.json({ error: 'Clinic not configured' }, { status: 503 })
    }
    const doctorDoc = doctorsSnap.docs[0]
    const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

    const start = new Date(startTime)
    const end = new Date(endTime)

    // Check for conflicts
    const conflictSnap = await adminDb.collection('appointments')
      .where('doctorId', '==', doctor.id)
      .where('status', '==', 'BOOKED')
      .where('startTime', '>=', startOfDay(start))
      .where('startTime', '<=', endOfDay(start))
      .get()

    const hasConflict = conflictSnap.docs.some((doc: any) => {
      const apt = doc.data()
      const aptStart = apt.startTime.toDate()
      const aptEnd = apt.endTime.toDate()
      return (
        (start >= aptStart && start < aptEnd) ||
        (end > aptStart && end <= aptEnd) ||
        (start <= aptStart && end >= aptEnd)
      )
    })

    if (hasConflict) {
      return Response.json({ error: 'This slot is no longer available' }, { status: 409 })
    }

    const newAppointmentRef = adminDb.collection('appointments').doc()
    const appointmentData = {
      patientId,
      doctorId: doctor.id,
      startTime: start,
      endTime: end,
      status: 'BOOKED',
      chiefComplaint: chiefComplaint || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    
    await newAppointmentRef.set(appointmentData)

    // Fire & Forget notifications
    const patientDoc = await adminDb.collection('patients').doc(patientId).get()
    const patient = patientDoc.data() as any

    if (patient) {
      const dateStr = format(start, 'PPP')
      const timeStr = format(start, 'p')
      const clinicName = doctor.clinicName || 'Clinic'
      const msg = `Hi ${patient.name}, your appointment at ${clinicName} is confirmed for ${dateStr} at ${timeStr}.`

      Promise.all([
        sendBookingConfirmation(patient.phone, {
          patientName: patient.name,
          doctorName: doctor.name || 'Doctor',
          appointmentTime: `${dateStr} at ${timeStr}`,
          clinicPhone: doctor.phone || clinicName
        }),
        patient.email ? sendEmail({
          to: patient.email,
          subject: 'Appointment Confirmed',
          html: `<p>${msg}</p>`
        }) : Promise.resolve(),
      ]).catch(err => console.error('[Notification Error]', err))
    }

    return Response.json({ appointment: { id: newAppointmentRef.id, ...appointmentData } }, { status: 201 })
  } catch (error) {
    console.error('[appointments-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
