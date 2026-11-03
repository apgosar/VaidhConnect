import { tenantDb } from '@/lib/db/tenant'
import type { Tenant } from '@/lib/tenant/types'
import type { Medicine } from '@/lib/constants'
import { savePrescription, type PrescriptionInput } from '@/lib/modules/prescriptions'
import { ymdInTz } from '@/lib/time'

export class QuickConsultError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface QuickConsultInput {
  /** An existing patient on the clinic's books, or the details of a new one (age OR date of birth). */
  patientId?: string
  patient?: { name: string; phone: string; ageYears?: number; dob?: string }
  diagnosis?: string | null
  medicines: Medicine[]
  notes?: string | null
  followUpDate?: string | null
}

/** The date of birth that makes someone exactly `age` years old today (clinic calendar). */
export function dobFromAge(age: number, today: string): string {
  return `${Number(today.slice(0, 4)) - age}${today.slice(4)}`
}

/**
 * A consultation the doctor held away from the clinic (a call or video chat): find or add the patient,
 * record the consultation as a completed visit of its own, and save the prescription on it. Everything
 * that already works on a visit (PDF on the letterhead, WhatsApp, history, follow-up reminder) then
 * works unchanged, because it IS a visit. It never takes a booking slot: only BOOKED visits do.
 */
export async function createQuickConsult(tenant: Tenant, actorUid: string, input: QuickConsultInput, now = new Date()) {
  const db = tenantDb(tenant)
  if (!input.medicines.some(m => m.name.trim())) throw new QuickConsultError(400, 'Add at least one medicine')

  let patientId: string
  let patientCreated = false
  if (input.patientId) {
    const snap = await db.col('patients').doc(input.patientId).get()
    if (!snap.exists) throw new QuickConsultError(404, 'Patient not found')
    patientId = snap.id
  } else if (input.patient) {
    const { name, phone, ageYears } = input.patient
    const today = ymdInTz(now, tenant.timezone)
    const dob = input.patient.dob || (ageYears !== undefined ? dobFromAge(ageYears, today) : undefined)
    if (!dob) throw new QuickConsultError(400, 'Enter the patient\'s age or date of birth')

    // The same person on the same number (typed again, or a returning patient) is the same record, however
    // their age was entered this time. Different people can share a phone, so the name has to match too.
    const sameNumber = await db.col('patients').where('phone', '==', phone).get()
    const match = sameNumber.docs.find(d => String(d.data().name ?? '').trim().toLowerCase() === name.trim().toLowerCase())
    if (match) {
      patientId = match.id
    } else {
      const ref = db.col('patients').doc()
      await ref.set({
        phone, name: name.trim(), dob: new Date(`${dob}T00:00:00Z`),
        // An age is an estimate; keep that visible so nobody mistakes it for a recorded birth date.
        ...(input.patient.dob ? {} : { dobApproximate: true }),
        medicalHistory: null, email: null,
        createdAt: now, updatedAt: now, createdBy: `staff:${actorUid}`,
      })
      patientId = ref.id
      patientCreated = true
    }
  } else {
    throw new QuickConsultError(400, 'Choose or add a patient')
  }

  const profile = await db.profile().get()
  const minutes = Number((profile.data() as any)?.slotDurationMins) || 15
  const apptRef = db.col('appointments').doc()
  await apptRef.set({
    patientId,
    doctorId: profile.id,
    startTime: now,
    endTime: new Date(now.getTime() + minutes * 60_000),
    status: 'COMPLETED',
    visitType: 'TELECONSULTATION',
    chiefComplaint: 'Teleconsultation',
    // Nothing to remind anyone about: the visit has already happened.
    reminderSent24h: true,
    reminderSent1h: true,
    createdBy: `staff:${actorUid}`,
    createdAt: now,
    updatedAt: now,
  })

  const rx: PrescriptionInput = {
    appointmentId: apptRef.id,
    patientId,
    diagnosis: input.diagnosis ?? null,
    medicines: input.medicines.filter(m => m.name.trim()),
    notes: input.notes ?? null,
    followUpDate: input.followUpDate ?? null,
  }
  let prescription
  try {
    prescription = await savePrescription(tenant, rx)
  } catch (e) {
    // Do not leave a visit with no prescription behind (e.g. a follow-up date the clinic rejects), nor a patient made only for it.
    await apptRef.delete().catch(() => {})
    if (patientCreated) await db.col('patients').doc(patientId).delete().catch(() => {})
    throw e
  }

  return { appointmentId: apptRef.id, patientId, prescriptionId: prescription.id, patientCreated }
}
