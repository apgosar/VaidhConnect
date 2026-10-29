import { z } from 'zod'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { cancelAppointment, reopenAppointment, BookingError } from '@/lib/modules/booking'
import { audit } from '@/lib/audit'
import { getPatientSession } from '@/lib/auth/patientPin'
import { apiError } from '@/lib/errors'

const STATUSES = ['BOOKED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  chiefComplaint: z.string().trim().max(500).optional(),
  consultationNotes: z.string().max(10000).optional(),
})

// Doctor-only: consumed by the doctor appointment detail page. Patients
// never fetch an appointment directly by ID (booking + list use
// /api/appointments, cancel uses PATCH below).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const db = tenantDb(tenant)
    const session = await getSession()
    if (!session?.uid) {
      return apiError('UNAUTHORIZED')
    }

    const denied = forbid(session, 'appointments:manage')
    if (denied) return denied

    const { id } = await params
    await audit(tenant, session, 'appointment.view', `appointments/${id}`)

    const appointmentRef = db.col('appointments').doc(id)
    const appointmentDoc = await appointmentRef.get()

    if (!appointmentDoc.exists) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const aptData = appointmentDoc.data() as any
    delete aptData.cancelTokenHash // secret-derived; never leaves the server
    const appointment = {
      id: appointmentDoc.id,
      ...aptData,
      startTime: aptData.startTime?.toDate(),
      endTime: aptData.endTime?.toDate(),
    }

    if (aptData.patientId) {
      const patientDoc = await db.col('patients').doc(aptData.patientId).get()
      if (patientDoc.exists) {
        const pd = patientDoc.data() as any
        appointment.patient = {
          id: patientDoc.id,
          ...pd,
          dob: pd.dob?.toDate()
        }
      }
    }

    const prescriptionSnap = await db.col('prescriptions').where('appointmentId', '==', id).get()
    if (!prescriptionSnap.empty) {
      const pDoc = prescriptionSnap.docs[0]
      appointment.prescription = { id: pDoc.id, ...pDoc.data() }
    }

    const paymentSnap = await db.col('payments').where('appointmentId', '==', id).get()
    if (!paymentSnap.empty) {
      const payDoc = paymentSnap.docs[0]
      appointment.payment = { id: payDoc.id, ...payDoc.data() }
    }

    return Response.json({ appointment })
  } catch (error) {
    console.error('[appointment-get]', error)
    return apiError('SERVER_ERROR')
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const db = tenantDb(tenant)
    const { id } = await params

    const parsed = await parseBody(request, patchSchema)
    if ('error' in parsed) return parsed.error
    const { status, chiefComplaint, consultationNotes } = parsed.data

    const session = await getSession()

    if (!session) {
      // A patient may only cancel, and only an appointment their PIN session
      // owns. Everything else needs a signed-in clinic user.
      const patient = await getPatientSession(tenant)
      const bareCancel = status === 'CANCELLED' && chiefComplaint === undefined && consultationNotes === undefined
      if (!patient || !bareCancel) return apiError('UNAUTHORIZED')
      await cancelAppointment(tenant, id, { kind: 'patient', session: patient })
      return Response.json({ ok: true })
    }

    const denied = forbid(session, 'appointments:manage')
    if (denied) return denied

    const ref = db.col('appointments').doc(id)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Appointment not found' }, { status: 404 })

    // Status changes that touch the slot go through the booking module so the
    // slot lock is always released/re-acquired together with the status.
    if (status === 'CANCELLED') await cancelAppointment(tenant, id, { kind: 'staff', uid: session.uid })
    else if (status === 'BOOKED') await reopenAppointment(tenant, id)

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (status && status !== 'CANCELLED' && status !== 'BOOKED') update.status = status
    if (chiefComplaint !== undefined) update.chiefComplaint = chiefComplaint
    if (consultationNotes !== undefined) update.consultationNotes = consultationNotes
    if (Object.keys(update).length > 1) await ref.update(update)

    await audit(tenant, session, 'appointment.update', `appointments/${id}`, { status, notesChanged: consultationNotes !== undefined })

    const updated = (await ref.get()).data() as any
    return Response.json({
      appointment: { id, ...updated, startTime: updated.startTime?.toDate(), endTime: updated.endTime?.toDate() },
    })
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status })
    console.error('[appointment-patch]', error)
    return apiError('SERVER_ERROR')
  }
}
