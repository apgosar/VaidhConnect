import { adminDb } from '../firebase/server'
import type { Tenant } from './types'

/**
 * Every clinic on the platform, for background jobs. During a migration a
 * clinic can exist in both layouts; the domain mapping decides which one is
 * live (default: the legacy copy, until cutover).
 */
export async function listTenants(): Promise<Tenant[]> {
  const [legacy, scoped, domains] = await Promise.all([
    adminDb.collection('doctors').get(),
    adminDb.collection('clinics').get(),
    adminDb.collection('domains').get(),
  ])

  const scopedLive = new Set<string>()
  for (const d of domains.docs) {
    const data = d.data() as any
    if (data.storage === 'scoped' && data.clinicId) scopedLive.add(data.clinicId)
  }

  const tenants = new Map<string, Tenant>()
  const tz = (data: any) => data?.timezone || 'Asia/Kolkata'
  const features = (data: any) => (data?.features && typeof data.features === 'object' ? data.features : undefined)

  for (const d of legacy.docs) {
    tenants.set(d.id, { clinicId: d.id, storage: 'legacy', timezone: tz(d.data()), features: features(d.data()) })
  }
  for (const d of scoped.docs) {
    if (!tenants.has(d.id) || scopedLive.has(d.id)) {
      tenants.set(d.id, { clinicId: d.id, storage: 'scoped', timezone: tz(d.data()), features: features(d.data()) })
    }
  }
  // Suspended clinics get no background jobs (reminders, summaries).
  const suspended = new Set(
    [...legacy.docs, ...scoped.docs].filter(d => (d.data() as any)?.status === 'suspended').map(d => d.id),
  )
  return [...tenants.values()].filter(t => !suspended.has(t.clinicId))
}

/** Run `fn` over items with bounded concurrency; callers handle their own errors. */
export async function forEachLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

/** The public address patients use for a clinic: a custom domain if it has one, otherwise the first mapped host. */
export async function clinicBookingUrl(clinicId: string): Promise<string | null> {
  const snap = await adminDb.collection('domains').where('clinicId', '==', clinicId).get()
  const hosts = snap.docs.map(d => d.id).sort()
  const host = hosts.find(h => !h.endsWith('.run.app')) ?? hosts[0]
  return host ? `https://${host}` : null
}
