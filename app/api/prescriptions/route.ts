import { z } from 'zod'
import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { MAX_TAPER_STEPS, taperTotalDays } from '@/lib/taper'
import { addDaysYmd, isValidYmd, ymdInTz } from '@/lib/time'
import { rememberMedicines } from '@/lib/modules/medicineCatalog'

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
  if (!tenant) return { error: Response.json({ error: 'Clinic not found' }, { status: 404 }) }
  const gated = featureGate(tenant, 'prescriptions')
  if (gated) return { error: gated }
  const session = await getSession()
  if (!session?.uid) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = forbid(session, 'prescriptions:manage')
  if (denied) return { error: denied }
  return { tenant, session, db: tenantDb(tenant) }
}

// POST — save/update the prescription for an appointment
export async function POST(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session, db } = a

    const parsed = await parseBody(request, prescriptionSchema)
    if ('error' in parsed) return parsed.error
    const { appointmentId, patientId, diagnosis, medicines, notes } = parsed.data
    const followUpDate = parsed.data.followUpDate || null

    const appt = await db.col('appointments').doc(appointmentId).get()
    if (!appt.exists || appt.data()?.patientId !== patientId) {
      return Response.json({ error: 'Appointment and patient do not match' }, { status: 400 })
    }

    // The follow-up must be a real date, no earlier than the visit itself, and not years away.
    if (followUpDate) {
      const visitDay = ymdInTz(appt.data()!.startTime.toDate(), tenant.timezone)
      if (!isValidYmd(followUpDate)) return Response.json({ error: 'Choose a valid follow-up date' }, { status: 400 })
      if (followUpDate < visitDay) return Response.json({ error: 'The follow-up date cannot be before the visit' }, { status: 400 })
      if (followUpDate > addDaysYmd(visitDay, 731)) return Response.json({ error: 'The follow-up date is too far away' }, { status: 400 })
    }

    const existing = await db.col('prescriptions').where('appointmentId', '==', appointmentId).limit(1).get()
    const previous = existing.empty ? null : (existing.docs[0].data() as any)
    const now = new Date()
    // A tapering medicine states its length in its steps; keep the plain fields in step with it so
    // anything reading them (lists, search) still shows something sensible.
    const stored = medicines.map(m => m.taper
      ? { ...m, dosage: m.taper.steps[0].dose, frequency: 'Tapering', duration: `${taperTotalDays(m.taper.steps)} days` }
      : m)
    const data: Record<string, unknown> = { appointmentId, patientId, diagnosis: diagnosis ?? null, medicines: stored, notes: notes ?? null, followUpDate, updatedAt: now }
    // A new or changed follow-up date is a new reminder to send.
    if (followUpDate !== (previous?.followUpDate ?? null)) data.followUpReminderSent = false

    let id: string
    if (existing.empty) {
      const ref = db.col('prescriptions').doc()
      await ref.set({ ...data, createdAt: now })
      id = ref.id
    } else {
      await existing.docs[0].ref.update(data)
      id = existing.docs[0].id
    }

    // Remember the medicines for next time's suggestions. A failure here must never lose the prescription.
    await rememberMedicines(db, stored as any, (previous?.medicines ?? []).map((m: any) => m.name)).catch(e => console.error('[medicine-catalog]', e))

    await audit(tenant, session, 'prescription.save', `prescriptions/${id}`)
    return Response.json({ prescription: { id, ...data } }, { status: 201 })
  } catch (error) {
    console.error('[prescription-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
