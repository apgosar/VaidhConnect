import { cache } from 'react'
import { getTenant } from './resolve'
import { tenantDb } from '../db/tenant'
import type { Tenant } from './types'

export interface ClinicProfile {
  tenant: Tenant
  data: Record<string, any>
}

/** The resolved clinic and its profile, fetched once per request. */
export const getClinicProfile = cache(async (): Promise<ClinicProfile | null> => {
  const tenant = await getTenant()
  if (!tenant) return null
  const snap = await tenantDb(tenant).profile().get()
  if (!snap.exists) return null
  return { tenant, data: snap.data() as Record<string, any> }
})
