import { z } from 'zod'
import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { MAX_TAPER_STEPS } from '@/lib/taper'
import { savePrescription, PrescriptionError, type PrescriptionInput } from '@/lib/modules/prescriptions'
import { apiError } from '@/lib/errors'

const text = (max: number) => z.string().trim().max(max)
const taperStepSchema = z.object({
  dose: text(100).min(1, 'Each step needs a dose'),
  frequency: text(100).optional().default(''),
  days: z.number().int().min(1, 'Each step needs at least 1 day').max(365),
  instructions: text(300).optional(),
})
const prescriptionSchema = z.object({
  appointmentId: z.string().min(1).max(128),
  patientId: z.string().min(1).max(128),
  diagnosis: text(2000).optional().nullable(),
  medicines: z.array(z.object({
    name: text(200),
    dosage: text(100).optional().default(''),
    frequency: text(100).optional().default(''),
    duration: text(100).optional().default(''),
    instructions: text(500).optional(),
    taper: z.object({ steps: z.array(taperStepSchema).min(1).max(MAX_TAPER_STEPS) }).optional(),
  })).max(50).default([]),
  notes: text(2000).optional().nullable(),
  // Clinic-calendar date (YYYY-MM-DD) the patient should come back; null/empty = none.
  followUpDate: z.string().trim().optional().nullable(),
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
