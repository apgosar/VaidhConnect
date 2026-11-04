import { getTenant } from '@/lib/tenant/resolve'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { apiError } from '@/lib/errors'
import { listShowcase, removeShowcaseItem, ShowcaseError } from '@/lib/modules/showcase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE /api/doctor/showcase/[id] — takes the item off the public page and deletes its files
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'settings:manage')
    if (denied) return denied
    const { id } = await params
    await removeShowcaseItem(tenant, id)
    await audit(tenant, session, 'showcase.remove', `showcase/${id}`)
    return Response.json({ items: await listShowcase(tenant) })
  } catch (e) {
    if (e instanceof ShowcaseError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[showcase-delete]', e)
    return apiError('SERVER_ERROR')
  }
}
