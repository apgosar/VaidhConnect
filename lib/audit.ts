import { tenantDb } from './db/tenant'
import type { Tenant } from './tenant/types'

/**
 * Append-only record of who did what to clinical data, kept per clinic. Needed
 * both for compliance and to scope a breach after the fact. Never throws: a
 * logging failure must not block care.
 */
export async function audit(
  tenant: Tenant,
  actor: { uid: string; role?: string; email?: string },
  action: string,
  target: string,
  meta?: Record<string, unknown>,
) {
  try {
    await tenantDb(tenant).col('audit_logs').add({
      at: new Date(),
      actorUid: actor.uid,
      actorEmail: actor.email ?? null,
      role: actor.role ?? null,
      action,
      target,
      ...(meta ? { meta } : {}),
    })
  } catch (err) {
    console.error('[audit] failed to record', action, target, err)
  }
}
