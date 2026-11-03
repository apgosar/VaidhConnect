import { z } from 'zod'
import { MAX_TAPER_STEPS } from '@/lib/taper'
import { MAX_ADVICE_LENGTH, MAX_ADVICE_OPTIONS } from '@/lib/constants'

const text = (max: number) => z.string().trim().max(max)

const taperStepSchema = z.object({
  dose: text(100).min(1, 'Each step needs a dose'),
  frequency: text(100).optional().default(''),
  days: z.number().int().min(1, 'Each step needs at least 1 day').max(365),
  instructions: text(300).optional(),
})

export const medicineSchema = z.object({
  name: text(200),
  dosage: text(100).optional().default(''),
  frequency: text(100).optional().default(''),
  duration: text(100).optional().default(''),
  instructions: text(500).optional(),
  taper: z.object({ steps: z.array(taperStepSchema).min(1).max(MAX_TAPER_STEPS) }).optional(),
})

/** What a prescription says. The appointment route and Quick prescription accept exactly the same content. */
export const prescriptionContentShape = {
  chiefComplaint: text(500).optional().nullable(),
  onExamination: text(1000).optional().nullable(),
  diagnosis: text(2000).optional().nullable(),
  medicines: z.array(medicineSchema).max(50).default([]),
  investigations: text(1000).optional().nullable(),
  /** The ticked items of the clinic's advice list. */
  advice: z.array(text(MAX_ADVICE_LENGTH).min(1)).max(MAX_ADVICE_OPTIONS).optional(),
  /** Anything else the doctor wants to say, beyond the list. */
  adviceOther: text(1000).optional().nullable(),
  notes: text(2000).optional().nullable(),
  // Clinic-calendar date (YYYY-MM-DD) the patient should come back; null/empty = none.
  followUpDate: z.string().trim().optional().nullable(),
}
