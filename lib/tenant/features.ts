import type { Tenant } from './types'

/**
 * Plan / feature flags, editable by the platform operator only (never by the
 * clinic via /api/doctor/profile). Absent flags default to ON so existing
 * clinics keep every capability they have today. Flags ride on the cached
 * Tenant, so checking one costs no extra read.
 */
export const FEATURES = ['prescriptions', 'payments', 'products', 'videos', 'whatsapp'] as const
export type Feature = typeof FEATURES[number]

export function hasFeature(profile: { features?: Record<string, boolean> } | undefined, feature: Feature): boolean {
  return profile?.features?.[feature] !== false
}

export const tenantHasFeature = (tenant: Tenant, feature: Feature) => hasFeature(tenant, feature)

/** Returns a 403 response if the clinic's plan lacks the feature, else null. */
export function featureGate(tenant: Tenant, feature: Feature): Response | null {
  if (tenantHasFeature(tenant, feature)) return null
  return Response.json({ error: 'This feature is not enabled for your plan' }, { status: 403 })
}
