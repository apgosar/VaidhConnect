import { z } from 'zod'
import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { prescriptionContentShape } from '@/lib/modules/prescriptionSchema'
import { savePrescription, PrescriptionError, type PrescriptionInput } from '@/lib/modules/prescriptions'
import { apiError } from '@/lib/errors'

const prescriptionSchema = z.object({
  appointmentId: z.string().min(1).max(128),
  patientId: z.string().min(1).max(128),
  ...prescriptionContentShape,
})

async function authorize() {
  const tenant = await getTenant()
  if (!tenant) return { error: apiError('CLINIC_NOT_FOUND') }
  const gated = featureGate(tenant, 'prescriptions')
  if (gated) return { error: gated }
  const session = await getSession()
  if (!session?.uid) return { error: apiError('UNAUTHORIZED') }
  const denied = forbid(session, 'prescriptions:manage')
  if (denied) return { error: denied }
  return { tenant, session, db: tenantDb(tenant) }
}

// POST — save/update the prescription for an appointment
export async function POST(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session } = a

    const parsed = await parseBody(request, prescriptionSchema)
    if ('error' in parsed) return parsed.error
    let saved
    try {
      saved = await savePrescription(tenant, parsed.data as PrescriptionInput)
    } catch (e) {
      if (e instanceof PrescriptionError) return Response.json({ error: e.message }, { status: e.status })
      throw e
    }
    const { id, data } = saved

    await audit(tenant, session, 'prescription.save', `prescriptions/${id}`)
    return Response.json({ prescription: { id, ...data } }, { status: 201 })
  } catch (error) {
    console.error('[prescription-post]', error)
    return apiError('SERVER_ERROR')
  }
}
