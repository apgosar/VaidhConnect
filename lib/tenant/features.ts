/**
 * Plan / feature flags, editable by the platform operator only (never by the
 * clinic via /api/doctor/profile). Absent flags default to ON so existing
 * clinics keep every capability they have today.
 */
export const FEATURES = ['prescriptions', 'payments', 'products', 'videos', 'whatsapp'] as const
export type Feature = typeof FEATURES[number]

export function hasFeature(profile: Record<string, any> | undefined, feature: Feature): boolean {
  return profile?.features?.[feature] !== false
}

import type { TenantDb } from '../db/tenant'

/** Returns a 403 response if the clinic's plan lacks the feature, else null. */
export async function featureGate(db: TenantDb, feature: Feature): Promise<Response | null> {
  const snap = await db.profile().get()
  if (hasFeature(snap.data(), feature)) return null
  return Response.json({ error: 'This feature is not enabled for your plan' }, { status: 403 })
}
