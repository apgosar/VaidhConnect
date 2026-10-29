/**
 * A tenant is one clinic. Every request is resolved to exactly one before
 * any data is read — no route may guess which clinic it is serving.
 *
 * `storage` lets the existing single-clinic data keep working untouched:
 *  - 'legacy': the clinic's data lives in the root collections (patients,
 *    appointments, ...) and its profile in doctors/{clinicId}.
 *  - 'scoped': data lives under clinics/{clinicId}/... (all new clinics).
 */
export interface Tenant {
  clinicId: string
  storage: 'legacy' | 'scoped'
  timezone: string
  /** Operator-controlled plan flags; absent = on. Cached with the tenant. */
  features?: Record<string, boolean>
}

export const COLLECTIONS = [
  'patients',
  'appointments',
  'prescriptions',
  'payments',
  'blocked_slots',
  'whatsapp_logs',
  'slot_locks',
  'rate_limits',
  'audit_logs',
  'users',
] as const

export type TenantCollection = typeof COLLECTIONS[number]
