import { tenantDb } from '@/lib/db/tenant'
import type { Tenant } from '@/lib/tenant/types'
import type { Medicine } from '@/lib/constants'
import { taperTotalDays } from '@/lib/taper'
import { addDaysYmd, isValidYmd, ymdInTz } from '@/lib/time'
import { rememberMedicines } from '@/lib/modules/medicineCatalog'

export class PrescriptionError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface PrescriptionInput {
  appointmentId: string
  patientId: string
  /** Why the patient came. Updates the visit's chief complaint; leave undefined to keep what it already says. */
  chiefComplaint?: string | null
  diagnosis?: string | null
  medicines: Medicine[]
  notes?: string | null
  /** Clinic-calendar date (YYYY-MM-DD) the patient should come back; null/empty = none. */
  followUpDate?: string | null
}

/**
 * Saves (or updates) the one prescription an appointment has. Used by the appointment page and by the
 * quick teleconsultation, so both validate and store a prescription the same way.
 */
export async function savePrescription(tenant: Tenant, input: PrescriptionInput) {
  const db = tenantDb(tenant)
  const { appointmentId, patientId, diagnosis, medicines, notes } = input
  const followUpDate = input.followUpDate || null

  const appt = await db.col('appointments').doc(appointmentId).get()
  if (!appt.exists || appt.data()?.patientId !== patientId) {
    throw new PrescriptionError(400, 'Appointment and patient do not match')
  }

  // The follow-up must be a real date, no earlier than the visit itself, and not years away.
  if (followUpDate) {
    const visitDay = ymdInTz(appt.data()!.startTime.toDate(), tenant.timezone)
    if (!isValidYmd(followUpDate)) throw new PrescriptionError(400, 'Choose a valid follow-up date')
    if (followUpDate < visitDay) throw new PrescriptionError(400, 'The follow-up date cannot be before the visit')
    if (followUpDate > addDaysYmd(visitDay, 731)) throw new PrescriptionError(400, 'The follow-up date is too far away')
  }

  if (input.chiefComplaint !== undefined) await appt.ref.update({ chiefComplaint: input.chiefComplaint?.trim() || null, updatedAt: new Date() })

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

  return { id, data }
}
