import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { searchMedicines } from '@/lib/modules/medicineCatalog'
import { apiError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

// GET /api/prescriptions/medicines?q=par — medicines this clinic has prescribed before whose name
// starts with the text, for the prescription form's suggestions.
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const gated = featureGate(tenant, 'prescriptions')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'prescriptions:manage')
    if (denied) return denied

    const q = new URL(request.url).searchParams.get('q') ?? ''
    return Response.json({ medicines: await searchMedicines(tenantDb(tenant), q.slice(0, 100)) })
  } catch (error) {
    console.error('[medicine-suggest]', error)
    return apiError('SERVER_ERROR')
  }
}
