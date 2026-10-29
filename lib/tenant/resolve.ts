import { headers } from 'next/headers'
import { adminDb } from '../firebase/server'
import type { Tenant } from './types'
import { currentTenant } from './context'
import { tenantDb } from '../db/tenant'

const CACHE_TTL_MS = 60_000
// A host with no clinic is cached only briefly, so a newly provisioned clinic
// goes live within seconds instead of after a full TTL.
const MISS_TTL_MS = 5_000
const cache = new Map<string, { tenant: Tenant | null; at: number }>()

function normalizeHost(raw: string | null): string {
  return (raw ?? '').toLowerCase().split(':')[0]
}

async function withProfile(base: Tenant): Promise<Tenant | null> {
  const ref = tenantDb(base).profile()
  const snap = await ref.get()
  const data = snap.data() as any
  // A suspended clinic does not resolve at all: every page and API behaves
  // as if the host is unknown, and background jobs skip it.
  if (data?.status === 'suspended') return null
  return {
    ...base,
    timezone: data?.timezone || base.timezone,
    features: data?.features && typeof data.features === 'object' ? data.features : undefined,
  }
}

async function lookup(host: string): Promise<Tenant | null> {
  // 1. Explicit domain mapping: domains/{host} -> { clinicId, storage?, timezone? }
  const domainDoc = await adminDb.collection('domains').doc(host).get()
  if (domainDoc.exists) {
    const d = domainDoc.data() as any
    return withProfile({
      clinicId: d.clinicId,
      storage: d.storage === 'legacy' ? 'legacy' : 'scoped',
      timezone: d.timezone || 'Asia/Kolkata',
    })
  }

  // 2. Backward compatibility for the original single-clinic deployment:
  //    if no mapping exists and exactly one legacy doctor exists, serve it.
  //    Switch off with TENANT_LEGACY_FALLBACK=off once every host is mapped.
  if (process.env.TENANT_LEGACY_FALLBACK === 'off') return null
  const doctors = await adminDb.collection('doctors').limit(2).get()
  if (doctors.size === 1) {
    return withProfile({ clinicId: doctors.docs[0].id, storage: 'legacy', timezone: 'Asia/Kolkata' })
  }
  return null
}

/** Resolve the tenant for an explicit host (used outside request scope). */
export async function resolveTenantForHost(rawHost: string | null): Promise<Tenant | null> {
  const host = normalizeHost(rawHost)
  const hit = cache.get(host)
  if (hit && Date.now() - hit.at < (hit.tenant ? CACHE_TTL_MS : MISS_TTL_MS)) return hit.tenant
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
