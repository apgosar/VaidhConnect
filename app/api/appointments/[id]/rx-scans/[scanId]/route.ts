import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { apiError } from '@/lib/errors'
import { removeScan, ScanError } from '@/lib/modules/rxScans'

export const runtime = 'nodejs'

// DELETE /api/appointments/[id]/rx-scans/[scanId] — remove one photo (a blurry or wrong one)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; scanId: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const gated = featureGate(tenant, 'prescriptions')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'prescriptions:manage')
    if (denied) return denied
    const { id, scanId } = await params
    await removeScan(tenant, id, scanId)
    await audit(tenant, session, 'prescription.scan_remove', `appointments/${id}`)
    return Response.json({ ok: true })
  } catch (e) {
    if (e instanceof ScanError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[rx-scans-delete]', e)
    return apiError('SERVER_ERROR')
  }
}
