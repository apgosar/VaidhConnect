import { z } from 'zod'
import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { PAYMENT_MODES } from '@/lib/constants'

const paymentSchema = z.object({
  appointmentId: z.string().min(1).max(128),
  patientId: z.string().min(1).max(128),
  amount: z.coerce.number().positive().max(10_000_000),
  mode: z.enum(PAYMENT_MODES),
  paidAt: z.string().min(8).max(40).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
})

async function authorize() {
  const tenant = await getTenant()
  if (!tenant) return { error: Response.json({ error: 'Clinic not found' }, { status: 404 }) }
  const gated = featureGate(tenant, 'payments')
  if (gated) return { error: gated }
  const session = await getSession()
  if (!session?.uid) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = forbid(session, 'payments:manage')
  if (denied) return { error: denied }
  return { tenant, session, db: tenantDb(tenant) }
}

// POST — log (or update) the payment for an appointment
export async function POST(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session, db } = a

    const parsed = await parseBody(request, paymentSchema)
    if ('error' in parsed) return parsed.error
    const { appointmentId, patientId, amount, mode, paidAt, notes } = parsed.data

    const paidDate = paidAt ? new Date(paidAt) : new Date()
    if (Number.isNaN(paidDate.getTime())) return Response.json({ error: 'Invalid payment date' }, { status: 400 })

    // The appointment must belong to this clinic and to that patient.
    const appt = await db.col('appointments').doc(appointmentId).get()
    if (!appt.exists || appt.data()?.patientId !== patientId) {
      return Response.json({ error: 'Appointment and patient do not match' }, { status: 400 })
    }

    const existing = await db.col('payments').where('appointmentId', '==', appointmentId).limit(1).get()
    const now = new Date()
    const paymentData: Record<string, unknown> = {
      appointmentId, patientId, amount, mode, paidAt: paidDate, notes: notes ?? null, updatedAt: now,
    }

    let paymentId: string
    if (existing.empty) {
      const ref = db.col('payments').doc()
      await ref.set({ ...paymentData, createdAt: now })
      paymentId = ref.id
    } else {
      await existing.docs[0].ref.update(paymentData)
      paymentId = existing.docs[0].id
    }

    await audit(tenant, session, 'payment.save', `payments/${paymentId}`, { amount, mode })
    return Response.json({ payment: { id: paymentId, ...paymentData } }, { status: 201 })
  } catch (error) {
    console.error('[payment-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
