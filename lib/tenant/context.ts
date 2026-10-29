import { AsyncLocalStorage } from 'node:async_hooks'
import type { Tenant } from './types'

/**
 * Carries the tenant through background work (cron, queued jobs) where there
 * is no request Host header to resolve it from. Anything awaited inside
 * runWithTenant — including fire-and-forget logging — sees the same tenant.
 */
const storage = new AsyncLocalStorage<Tenant>()

export const runWithTenant = <T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> =>
  storage.run(tenant, fn)

export const currentTenant = (): Tenant | undefined => storage.getStore()
