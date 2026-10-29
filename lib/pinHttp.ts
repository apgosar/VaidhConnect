import { z } from 'zod'
import { getTenant } from './tenant/resolve'
import { tenantDb } from './db/tenant'
import { phoneSchema } from './validation'
import { clientIp, rateLimit } from './ratelimit'
import { PinError } from './modules/patientAccess'

export const pinField = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits')
export const phoneBody = z.object({ phone: phoneSchema })
export const loginBody = z.object({ phone: phoneSchema, pin: pinField })
export const resetConfirmBody = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), pin: pinField })

/** Turn a PinError into the JSON response the pages understand. */
export const pinFail = (e: unknown): Response | null =>
  e instanceof PinError
    ? Response.json({ error: e.message, code: e.code, retryAfter: e.retryAfterSec }, { status: e.status })
    : null

/**
 * Shared preamble for the public PIN endpoints: resolve the clinic and apply a
 * per-IP budget so they can't be used to hammer or enumerate.
 */
export async function pinPreamble(request: Request, bucket: string, perHour: number) {
  const tenant = await getTenant()
  if (!tenant) return { error: Response.json({ error: 'Clinic not found' }, { status: 404 }) } as const
  if (!(await rateLimit(tenantDb(tenant), `${bucket}:ip:${clientIp(request)}`, perHour, 3600))) {
    return { error: Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 }) } as const
  }
  return { tenant, db: tenantDb(tenant), ip: clientIp(request) } as const
}
