import { z } from 'zod'
import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody, phoneSchema } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/ratelimit'
import { apiError } from '@/lib/errors'
import { MAX_TAPER_STEPS } from '@/lib/taper'
import { createQuickConsult, QuickConsultError, type QuickConsultInput } from '@/lib/modules/quickConsult'
import { PrescriptionError } from '@/lib/modules/prescriptions'

const text = (max: number) => z.string().trim().max(max)
const medicineSchema = z.object({
  name: text(200),
  dosage: text(100).optional().default(''),
  frequency: text(100).optional().default(''),
  duration: text(100).optional().default(''),
  instructions: text(500).optional(),
  taper: z.object({
    steps: z.array(z.object({
      dose: text(100).min(1, 'Each step needs a dose'),
      frequency: text(100).optional().default(''),
      days: z.number().int().min(1, 'Each step needs at least 1 day').max(365),
      instructions: text(300).optional(),
    })).min(1).max(MAX_TAPER_STEPS),
  }).optional(),
})

const bodySchema = z.object({
  patientId: z.string().min(1).max(128).optional(),
  patient: z.object({
    name: text(100).min(2, 'Enter the patient\'s full name'),
    phone: phoneSchema,
    ageYears: z.number().int().min(0, 'Enter a valid age').max(120, 'Enter a valid age').optional(),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date of birth').optional(),
  }).optional(),
  chiefComplaint: text(500).optional().nullable(),
  diagnosis: text(2000).optional().nullable(),
  medicines: z.array(medicineSchema).max(50).default([]),
  notes: text(2000).optional().nullable(),
  followUpDate: z.string().trim().optional().nullable(),
}).refine(b => !!b.patientId !== !!b.patient, 'Choose an existing patient or enter the new patient\'s details')

const CONSULTS_PER_HOUR = 60

// POST /api/doctor/quick-prescription — a consultation held by phone or video: add the patient if new, record
// the visit and save the prescription. Sending it on WhatsApp is the existing /api/prescriptions/[id]/whatsapp.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const gated = featureGate(tenant, 'prescriptions')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'prescriptions:manage') ?? forbid(session, 'patients:manage')
    if (denied) return denied
    if (!(await rateLimit(tenantDb(tenant), `quick-rx:${session.uid}`, CONSULTS_PER_HOUR, 3600))) return apiError('RATE_LIMITED')

    const parsed = await parseBody(request, bodySchema)
    if ('error' in parsed) return parsed.error
    const d = parsed.data
    if (d.patient && d.patient.ageYears === undefined && !d.patient.dob) {
      return Response.json({ error: 'Enter the patient\'s age or date of birth' }, { status: 400 })
    }

    let result
    try {
      result = await createQuickConsult(tenant, session.uid, d as QuickConsultInput)
    } catch (e) {
      if (e instanceof QuickConsultError || e instanceof PrescriptionError) return Response.json({ error: e.message }, { status: e.status })
      throw e
    }

    await audit(tenant, session, 'consult.quick', `appointments/${result.appointmentId}`, { patientCreated: result.patientCreated })
    return Response.json(result, { status: 201 })
  } catch (error) {
    console.error('[quick-prescription]', error)
    return apiError('SERVER_ERROR')
  }
}
