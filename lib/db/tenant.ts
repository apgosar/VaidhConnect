import { adminDb } from '../firebase/server'
import type { Tenant, TenantCollection } from '../tenant/types'

/**
 * The ONLY place tenant-owned collections are referenced. Route handlers
 * must go through this instead of calling adminDb.collection(...) so one
 * clinic's query can never return another clinic's records. (Enforced by
 * scripts/check-tenant-access.mjs.)
 */
export function tenantDb(tenant: Tenant) {
  const profileRef =
    tenant.storage === 'legacy'
      ? adminDb.collection('doctors').doc(tenant.clinicId)
      : adminDb.collection('clinics').doc(tenant.clinicId)

  return {
    /** The clinic's profile document (name, timings, theme, flags...). */
    profile: () => profileRef,
    col: (name: TenantCollection) =>
      tenant.storage === 'legacy'
        ? adminDb.collection(name)
        : profileRef.collection(name),
  }
}

export type TenantDb = ReturnType<typeof tenantDb>
