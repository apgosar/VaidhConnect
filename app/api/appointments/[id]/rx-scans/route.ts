import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/ratelimit'
import { apiError } from '@/lib/errors'
import { addScan, listScans, ScanError } from '@/lib/modules/rxScans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorize() {
  const tenant = await getTenant()
  if (!tenant) return { error: apiError('CLINIC_NOT_FOUND') }
  const gated = featureGate(tenant, 'prescriptions')
  if (gated) return { error: gated }
  const session = await getSession()
  if (!session?.uid) return { error: apiError('UNAUTHORIZED') }
  const denied = forbid(session, 'prescriptions:manage')
  if (denied) return { error: denied }
  return { tenant, session }
}

// GET /api/appointments/[id]/rx-scans — the photos of the handwritten prescription kept with this visit
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { id } = await params
    return Response.json({ scans: await listScans(a.tenant, id) })
  } catch (e) {
    if (e instanceof ScanError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[rx-scans-get]', e)
    return apiError('SERVER_ERROR')
  }
}

// POST /api/appointments/[id]/rx-scans — multipart, one or more `photo` files (camera or gallery)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session } = a
    const { id } = await params
    if (!(await rateLimit(tenantDb(tenant), `rx-scan:${session.uid}`, 60, 3600))) return apiError('RATE_LIMITED')

    const form = await request.formData().catch(() => null)
    const files = (form?.getAll('photo') ?? []).filter((f): f is File => typeof f !== 'string')
    if (files.length === 0) return Response.json({ error: 'Choose a photo to add' }, { status: 400 })

    for (const f of files) {
      await addScan(tenant, id, session.uid, { size: f.size, data: Buffer.from(await f.arrayBuffer()) })
    }
    await audit(tenant, session, 'prescription.scan_add', `appointments/${id}`, { count: files.length })
    return Response.json({ scans: await listScans(tenant, id) }, { status: 201 })
  } catch (e) {
    if (e instanceof ScanError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[rx-scans-post]', e)
    return apiError('SERVER_ERROR')
  }
}
