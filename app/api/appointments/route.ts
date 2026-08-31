import { adminDb } from '@/lib/firebase/server'
import { generateAvailableSlots } from '@/lib/slots'
import { type NextRequest } from 'next/server'
import { startOfDay, endOfDay, format } from 'date-fns'
import type { WeeklyTimings } from '@/lib/constants'
import { sendBookingConfirmation, sendReminder } from '@/lib/whatsapp'
import { sendEmail, appointmentReminderHtml } from '@/lib/email'

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
      
      const pData = patientDoc.data() as any
      // Find all duplicate patient IDs with same phone and name
      const dupSnap = await adminDb.collection('patients').where('phone', '==', pData.phone).get()
      const patientIds = dupSnap.docs
        .filter(d => d.data().name?.trim().toLowerCase() === pData.name?.trim().toLowerCase())
        .map(d => d.id)

      // Fetch all appointments for these IDs, filter in memory to avoid composite index
      const promises = patientIds.map(id => 
        adminDb.collection('appointments').where('patientId', '==', id).get()
      )
      const snaps = await Promise.all(promises)
      
      const appointments: any[] = []
      const now = new Date()

      for (const snap of snaps) {
        for (const doc of snap.docs) {
          const data = doc.data()
          const startTime = data.startTime?.toDate()
          if (data.status === 'BOOKED' && startTime && startTime >= now) {
            appointments.push({
              id: doc.id,
              startTime,
              endTime: data.endTime?.toDate(),
              status: data.status,
              chiefComplaint: data.chiefComplaint,
            })
          }
        }
      }
      
      appointments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

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
    const now = new Date()
    const diffHours = (start.getTime() - now.getTime()) / (1000 * 60 * 60)

    // Set reminder flags according to booking lead time:
    // If booked < 24h before, 24h reminder is marked true (skip 24h cron).
    // If booked < 1h before, 1h reminder is marked true (sent immediately below).
    const reminderSent24h = diffHours < 24
    const reminderSent1h = diffHours < 1

    const appointmentData = {
      patientId,
      doctorId: doctor.id,
      startTime: start,
      endTime: end,
      status: 'BOOKED',
      chiefComplaint: chiefComplaint || null,
      reminderSent24h,
      reminderSent1h,
      createdAt: now,
      updatedAt: now,
    }
    
    await newAppointmentRef.set(appointmentData)

    // Fire & Forget notifications
    const patientDoc = await adminDb.collection('patients').doc(patientId).get()
    const patient = patientDoc.data() as any

    if (patient) {
      const dateStr = format(start, 'PPP')
      const timeStr = format(start, 'p')
      const clinicName = doctor.clinicName || 'Clinic'
      const appointmentTimeFormatted = `${dateStr} at ${timeStr}`
      const clinicPhone = doctor.phone || clinicName
      const msg = `Hi ${patient.name}, your appointment at ${clinicName} is confirmed for ${appointmentTimeFormatted}.`

      const notificationTasks: Promise<any>[] = [
        // 1. Appointment Confirmation WhatsApp
        sendBookingConfirmation(patient.phone, {
          patientName: patient.name,
          doctorName: doctor.name || 'Doctor',
          appointmentTime: appointmentTimeFormatted,
          clinicPhone: clinicPhone
        }),
        // 1. Appointment Confirmation Email (if available)
        patient.email ? sendEmail({
          to: patient.email,
          subject: 'Appointment Confirmed',
          html: `<p>${msg}</p>`
        }) : Promise.resolve(),
      ]

      // 2. If appointment is booked less than 1 hour before, send Appointment Reminder IMMEDIATELY
      if (diffHours < 1) {
        notificationTasks.push(
          sendReminder(patient.phone, {
            patientName: patient.name,
            doctorName: doctor.name || 'Doctor',
            appointmentTime: appointmentTimeFormatted,
            clinicPhone: clinicPhone,
            directionsUrl: doctor.mapsUrl || 'Contact clinic for directions'
          })
        )

        if (patient.email) {
          notificationTasks.push(
            sendEmail({
              to: patient.email,
              subject: `Reminder: Upcoming Appointment — ${clinicName}`,
              html: appointmentReminderHtml({
                patientName: patient.name,
                doctorName: doctor.name || 'Doctor',
                clinicName: clinicName,
                appointmentTime: appointmentTimeFormatted,
                clinicPhone: doctor.phone ?? undefined,
                clinicAddress: doctor.address ?? undefined,
              })
            })
          )
        }
      }

      await Promise.all(notificationTasks).catch(err => console.error('[Notification Error]', err))

      // If this is a same-day booking and it's after the doctor's configured summaryHour,
      // send a real-time updated schedule notification (before summaryHour the morning cron covers it)
      const now = new Date()
      const summaryHour: number = typeof doctor.summaryHour === 'number' ? doctor.summaryHour : 10
      if (start.toDateString() === now.toDateString() && now.getHours() >= summaryHour) {
        const notifyPhone = (doctor.whatsappPhone as string | undefined)?.trim() || (doctor.phone as string | undefined)?.trim()
        if (notifyPhone) {
          const { sendSummaryUpdate } = await import('@/lib/whatsapp')
          const remainingSnap = await adminDb.collection('appointments')
            .where('doctorId', '==', doctor.id)
            .where('status', '==', 'BOOKED')
            .where('startTime', '>=', startOfDay(now))
            .where('startTime', '<=', endOfDay(now))
            .orderBy('startTime', 'asc')
            .get()

          let scheduleList = ''
          for (const doc of remainingSnap.docs) {
            const rApt = doc.data()
            if (rApt.patientId) {
              const pDoc = await adminDb.collection('patients').doc(rApt.patientId).get()
              const pName = pDoc.data()?.name || 'Unknown'
              const pPhone = pDoc.data()?.phone || ''
              scheduleList += `${format(rApt.startTime.toDate(), 'p')} - ${pName} - ${pPhone}\n`
            }
          }
          if (!scheduleList) scheduleList = 'No remaining appointments.'

          sendSummaryUpdate(notifyPhone, {
            doctorName: doctor.name || 'Doctor',
            cancelledPatientName: `New booking: ${patient.name}`,
            remainingCount: remainingSnap.size.toString(),
            scheduleList: scheduleList.trim(),
          }).catch(err => console.error('[DoctorScheduleUpdate Error]', err))
        }
      }
    }

    return Response.json({
      appointment: {
        id: newAppointmentRef.id,
        ...appointmentData,
        doctor: {
          name: doctor.name || 'Doctor',
          clinicName: doctor.clinicName || 'Clinic',
          address: doctor.address || undefined,
          phone: doctor.phone || undefined,
        },
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[appointments-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
