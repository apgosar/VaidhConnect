import { headers } from 'next/headers'
import { adminDb } from '../firebase/server'
import type { Tenant } from './types'
import { currentTenant } from './context'

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { tenant: Tenant | null; at: number }>()

function normalizeHost(raw: string | null): string {
  return (raw ?? '').toLowerCase().split(':')[0]
}

async function lookup(host: string): Promise<Tenant | null> {
  // 1. Explicit domain mapping: domains/{host} -> { clinicId, storage?, timezone? }
  const domainDoc = await adminDb.collection('domains').doc(host).get()
  if (domainDoc.exists) {
    const d = domainDoc.data() as any
    return {
      clinicId: d.clinicId,
      storage: d.storage === 'legacy' ? 'legacy' : 'scoped',
      timezone: d.timezone || 'Asia/Kolkata',
    }
  }

  // 2. Backward compatibility for the original single-clinic deployment:
  //    if no mapping exists and exactly one legacy doctor exists, serve it.
  //    Once any mapping exists this fallback is only used for unmapped
  //    hosts (e.g. the raw Cloud Run URL) and can be switched off with
  //    TENANT_LEGACY_FALLBACK=off.
  if (process.env.TENANT_LEGACY_FALLBACK === 'off') return null
  const doctors = await adminDb.collection('doctors').limit(2).get()
  if (doctors.size === 1) {
    return { clinicId: doctors.docs[0].id, storage: 'legacy', timezone: 'Asia/Kolkata' }
  }
  return null
}

/** Resolve the tenant for an explicit host (used outside request scope). */
export async function resolveTenantForHost(rawHost: string | null): Promise<Tenant | null> {
  const host = normalizeHost(rawHost)
  const hit = cache.get(host)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tenant
  const tenant = await lookup(host)
  cache.set(host, { tenant, at: Date.now() })
  return tenant
}

/** Resolve the tenant for the current request from its Host header. */
export async function getTenant(): Promise<Tenant | null> {
  // Background work (cron) runs inside runWithTenant and has no Host header.
  const ctx = currentTenant()
  if (ctx) return ctx
  const h = await headers()
  return resolveTenantForHost(h.get('x-forwarded-host') ?? h.get('host'))
}

/** Like getTenant but throws a typed error handlers can map to 404. */
export class TenantNotFoundError extends Error {
  constructor() { super('Clinic not found for this host') }
}
export async function requireTenant(): Promise<Tenant> {
  const t = await getTenant()
  if (!t) throw new TenantNotFoundError()
  return t
}
