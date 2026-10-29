import { z } from 'zod'
import { FEATURES } from './tenant/features'

export const createClinicSchema = z.object({
  id: z.string().trim().min(2).max(41),
  name: z.string().trim().min(1).max(120),
  doctor: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(120),
  domain: z.string().trim().min(3).max(200),
  timezone: z.string().trim().max(60).optional(),
  specialty: z.string().trim().max(60).optional(),
  primary: z.string().trim().max(7).optional(),
})

export const patchClinicSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  // partialRecord: the console flips one flag at a time. (z.record over an enum
  // is exhaustive in Zod 4 and would demand every flag on every request.)
  features: z.partialRecord(z.enum(FEATURES), z.boolean()).optional(),
  theme: z.object({ primary: z.string().max(7).nullable() }).optional(),
  timezone: z.string().trim().max(60).optional(),
  addDomain: z.string().trim().toLowerCase().min(3).max(200).optional(),
  removeDomain: z.string().trim().toLowerCase().min(3).max(200).optional(),
  resetOwnerPassword: z.boolean().optional(),
})
