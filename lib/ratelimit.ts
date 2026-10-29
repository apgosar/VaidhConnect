import { createHash } from 'node:crypto'
import type { TenantDb } from './db/tenant'

/**
 * Fixed-window counter in the clinic's own `rate_limits` collection, so one
 * clinic's traffic can never consume another's budget. Keys are hashed so no
 * raw phone numbers or IPs are stored. Add a Firestore TTL policy on
 * `expiresAt` for the `rate_limits` collection group to garbage-collect.
 */
export async function rateLimit(
  db: TenantDb,
  key: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): Promise<boolean> {
  const bucket = Math.floor(now.getTime() / (windowSeconds * 1000))
  const id = createHash('sha256').update(`${key}:${bucket}`).digest('hex').slice(0, 40)
  const ref = db.col('rate_limits').doc(id)

  return ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const count = (snap.data()?.count as number | undefined) ?? 0
    if (count >= limit) return false
    tx.set(ref, { count: count + 1, expiresAt: new Date((bucket + 2) * windowSeconds * 1000) })
    return true
  })
}

/** Best-effort client IP behind Cloud Run: the last X-Forwarded-For hop is the one Google appends. */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (!xff) return 'unknown'
  const hops = xff.split(',').map(s => s.trim()).filter(Boolean)
  return hops[hops.length - 1] ?? 'unknown'
}
