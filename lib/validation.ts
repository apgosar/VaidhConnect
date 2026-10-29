import { z } from 'zod'
import { isValidYmd } from './time'

/** E.164-style phone: strips spaces/dashes/brackets; a bare 10-digit number is treated as Indian. */
export function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s\-()]/g, '')
  return /^\d{10}$/.test(s) ? `+91${s}` : s
}

export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine(p => /^\+\d{8,15}$/.test(p), 'Enter a valid mobile number with country code')

const trimmed = (max: number) => z.string().trim().max(max)

export const patientDetailsSchema = z.object({
  name: trimmed(100).min(2, 'Enter the patient\'s full name'),
  phone: phoneSchema,
  dob: z.string().refine(isValidYmd, 'Enter a valid date of birth')
    .refine(s => new Date(s) <= new Date() && new Date(s).getUTCFullYear() > 1900, 'Enter a valid date of birth'),
  email: z.union([z.literal(''), z.string().trim().email().max(120)]).optional(),
  medicalHistory: trimmed(2000).optional(),
})
export type PatientDetails = z.infer<typeof patientDetailsSchema>

export const bookingSchema = z.object({
  // Exactly one of these identifies the patient. patientId is staff-only.
  patient: patientDetailsSchema.optional(),
  patientId: z.string().min(1).max(128).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  chiefComplaint: trimmed(500).optional(),
}).refine(b => !!b.patient !== !!b.patientId, 'Provide either patient details or a patientId')
export type BookingInput = z.infer<typeof bookingSchema>

export const cancelTokenSchema = z.object({ token: z.string().min(20).max(200) })

export const lookupSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(128), token: z.string().min(20).max(200) })).min(1).max(20),
})

/** Parse JSON with a schema; returns a 400 Response on failure. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let json: unknown
  try { json = await request.json() } catch {
    return { error: Response.json({ error: 'Invalid request body' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return { error: Response.json({ error: msg }, { status: 400 }) }
  }
  return { data: parsed.data }
}
