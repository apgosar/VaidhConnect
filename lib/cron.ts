import { listTenants, forEachLimited } from './tenant/list'
import { runWithTenant } from './tenant/context'
import type { Tenant } from './tenant/types'

/** Bearer check; rejects everything if CRON_SECRET is unset. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && request.headers.get('authorization') === 'Bearer ' + secret
}

/**
 * Run a job for every clinic, isolated from one another: one clinic's failure
 * (e.g. a bad WhatsApp token) is recorded and never blocks the rest.
 */
export async function runForAllClinics<R>(job: (tenant: Tenant) => Promise<R>) {
  const tenants = await listTenants()
  const results: Array<{ clinicId: string; ok: boolean; result?: R; error?: string }> = []
  await forEachLimited(tenants, 5, async tenant => {
    try {
      const result = await runWithTenant(tenant, () => job(tenant))
      results.push({ clinicId: tenant.clinicId, ok: true, result })
    } catch (e: any) {
      console.error('[cron]', tenant.clinicId, e)
      results.push({ clinicId: tenant.clinicId, ok: false, error: String(e?.message ?? e) })
    }
  })
  return { clinics: tenants.length, failed: results.filter(r => !r.ok).length, results }
}
