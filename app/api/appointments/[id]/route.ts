import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { sendCancellation, sendSummaryUpdate } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email'
import { format, startOfDay, endOfDay } from 'date-fns'

/**
 * Sends the doctor an updated schedule summary for real-time same-day changes.
 * Only fires AFTER the doctor's configured summaryHour (default 10am) — before that,
 * the morning summary cron covers it. Uses whatsappPhone if set, falls back to phone.
 */
async function sendDoctorScheduleUpdate(doctorId: string, changeType: 'new_booking' | 'cancellation', patientName: string) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)

  const doctorDoc = await adminDb.collection('doctors').doc(doctorId).get()
  if (!doctorDoc.exists) return
  const doctor = doctorDoc.data() as any

  // Only fire after the configured summary hour (doctor has already received the morning summary)
  const summaryHour: number = typeof doctor.summaryHour === 'number' ? doctor.summaryHour : 10
  if (now.getHours() < summaryHour) return

  // Prefer private whatsappPhone for notifications, fall back to clinic phone
  const notifyPhone = doctor.whatsappPhone?.trim() || doctor.phone?.trim()
  if (!notifyPhone) return

  const remainingSnap = await adminDb.collection('appointments')
    .where('doctorId', '==', doctorId)
    .where('status', '==', 'BOOKED')
    .where('startTime', '>=', todayStart)
    .where('startTime', '<=', todayEnd)
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

  await sendSummaryUpdate(notifyPhone, {
    doctorName: doctor.name || 'Doctor',
    cancelledPatientName: changeType === 'cancellation' ? patientName : `New booking: ${patientName}`,
    remainingCount: remainingSnap.size.toString(),
    scheduleList: scheduleList.trim(),
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const appointmentRef = adminDb.collection('appointments').doc(id)
    const appointmentDoc = await appointmentRef.get()

    if (!appointmentDoc.exists) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const aptData = appointmentDoc.data() as any
    const appointment = {
      id: appointmentDoc.id,
      ...aptData,
      startTime: aptData.startTime?.toDate(),
      endTime: aptData.endTime?.toDate(),
    }

    // Fetch related patient
    if (aptData.patientId) {
      const patientDoc = await adminDb.collection('patients').doc(aptData.patientId).get()
      if (patientDoc.exists) {
        const pd = patientDoc.data() as any
        appointment.patient = { 
          id: patientDoc.id, 
          ...pd,
          dob: pd.dob?.toDate() 
        }
      }
    }

    // Fetch related prescription
    const prescriptionSnap = await adminDb.collection('prescriptions').where('appointmentId', '==', id).get()
    if (!prescriptionSnap.empty) {
      const pDoc = prescriptionSnap.docs[0]
      appointment.prescription = { id: pDoc.id, ...pDoc.data() }
    }

    // Fetch related payment
    const paymentSnap = await adminDb.collection('payments').where('appointmentId', '==', id).get()
    if (!paymentSnap.empty) {
      const payDoc = paymentSnap.docs[0]
      appointment.payment = { id: payDoc.id, ...payDoc.data() }
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
    const session = await getSession()

    // Allow patient to cancel (no auth) — only allow CANCELLED status without auth
    if (status && status !== 'CANCELLED' && !session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appointmentRef = adminDb.collection('appointments').doc(id)
    const appointmentDoc = await appointmentRef.get()

    if (!appointmentDoc.exists) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 })
    }
    
    const updateData: any = { updatedAt: new Date() }
    if (status) updateData.status = status
    if (chiefComplaint !== undefined) updateData.chiefComplaint = chiefComplaint
    if (consultationNotes !== undefined) updateData.consultationNotes = consultationNotes

    await appointmentRef.update(updateData)

    const updatedDoc = await appointmentRef.get()
    const aptData = updatedDoc.data() as any
    const appointment = {
      id: updatedDoc.id,
      ...aptData,
      startTime: aptData.startTime?.toDate(),
      endTime: aptData.endTime?.toDate(),
    } as any

    // Fetch related patient and doctor for notifications
    if (aptData.patientId) {
      const patientDoc = await adminDb.collection('patients').doc(aptData.patientId).get()
      if (patientDoc.exists) {
        const pd = patientDoc.data() as any
        appointment.patient = { name: pd.name, phone: pd.phone, email: pd.email }
      }
    }
    
    if (aptData.doctorId) {
      const doctorDoc = await adminDb.collection('doctors').doc(aptData.doctorId).get()
      if (doctorDoc.exists) {
        appointment.doctor = { 
          clinicName: doctorDoc.data()?.clinicName,
          name: doctorDoc.data()?.name,
          phone: doctorDoc.data()?.phone
        }
      }
    }

    // If cancelled, send notification to patient + trigger doctor schedule update
    if (status === 'CANCELLED' && appointment.patient && appointment.doctor) {
      const dateStr = format(appointment.startTime, 'PPP')
      const timeStr = format(appointment.startTime, 'p')
      const clinicName = appointment.doctor.clinicName || 'Clinic'
      const clinicPhone = appointment.doctor.phone || clinicName
      const msg = `Hi ${appointment.patient.name}, your appointment at ${clinicName} for ${dateStr} at ${timeStr} has been cancelled.`

      const tasks: Promise<any>[] = []

      // Patient cancellation notification
      tasks.push(sendCancellation(appointment.patient.phone, {
        patientName: appointment.patient.name,
        appointmentTime: `${dateStr} at ${timeStr}`,
        clinicPhone: clinicPhone
      }))

      if (appointment.patient.email) {
        tasks.push(sendEmail({
          to: appointment.patient.email,
          subject: 'Appointment Cancelled',
          html: `<p>${msg}</p>`
        }))
      }

      // If cancelled for today, send real-time updated schedule to doctor
      // (only fires after the configured summaryHour — before that the morning summary covers it)
      const now = new Date()
      if (appointment.startTime.toDateString() === now.toDateString()) {
        tasks.push(
          sendDoctorScheduleUpdate(aptData.doctorId, 'cancellation', appointment.patient.name)
            .catch(err => console.error('[DoctorScheduleUpdate Error]', err))
        )
      }

      await Promise.all(tasks).catch(err => console.error('[Notification Error]', err))
    }

    // New same-day booking after summaryHour → notify doctor in real time
    if (status === 'BOOKED' && appointment.patient) {
      const now = new Date()
      if (appointment.startTime.toDateString() === now.toDateString()) {
        sendDoctorScheduleUpdate(aptData.doctorId, 'new_booking', appointment.patient.name)
          .catch(err => console.error('[DoctorScheduleUpdate Error]', err))
      }
    }

    return Response.json({ appointment })
  } catch (error) {
    console.error('[appointment-patch]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
