import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { sendCancellation, sendSummaryUpdate } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email'
import { format, startOfDay, endOfDay } from 'date-fns'

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
      if (patientDoc.exists) appointment.patient = { id: patientDoc.id, ...patientDoc.data() }
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

    // If cancelled, send notification
    if (status === 'CANCELLED' && appointment.patient && appointment.doctor) {
      const dateStr = format(appointment.startTime, 'PPP')
      const timeStr = format(appointment.startTime, 'p')
      const clinicName = appointment.doctor.clinicName || 'Clinic'
      const clinicPhone = appointment.doctor.phone || clinicName
      const msg = `Hi ${appointment.patient.name}, your appointment at ${clinicName} for ${dateStr} at ${timeStr} has been cancelled.`

      const tasks = []
      
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

      // If cancelled today, send updated summary to doctor
      const now = new Date()
      if (appointment.startTime.toDateString() === now.toDateString() && appointment.doctor.phone) {
        tasks.push((async () => {
          const start = startOfDay(now)
          const end = endOfDay(now)
          const remainingSnap = await adminDb.collection('appointments')
            .where('doctorId', '==', aptData.doctorId)
            .where('status', '==', 'BOOKED')
            .where('startTime', '>=', start)
            .where('startTime', '<=', end)
            .orderBy('startTime', 'asc')
            .get()

          let scheduleList = ''
          for (const doc of remainingSnap.docs) {
            const rApt = doc.data()
            if (rApt.patientId) {
              const pDoc = await adminDb.collection('patients').doc(rApt.patientId).get()
              const pName = pDoc.data()?.name || 'Unknown'
              const pPhone = pDoc.data()?.phone || 'Unknown'
              scheduleList += `${format(rApt.startTime.toDate(), 'p')} - ${pName} - ${pPhone}\n`
            }
          }
          if (!scheduleList) scheduleList = 'No remaining appointments.'

          await sendSummaryUpdate(appointment.doctor.phone, {
            doctorName: appointment.doctor.name || 'Doctor',
            cancelledPatientName: appointment.patient.name,
            remainingCount: remainingSnap.size.toString(),
            scheduleList: scheduleList.trim()
          })
        })())
      }

      Promise.all(tasks).catch(err => console.error('[Notification Error]', err))
    }

    return Response.json({ appointment })
  } catch (error) {
    console.error('[appointment-patch]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
