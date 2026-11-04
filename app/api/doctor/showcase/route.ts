import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/ratelimit'
import { apiError } from '@/lib/errors'
import { addShowcaseItem, listShowcase, updateShowcase, ShowcaseError } from '@/lib/modules/showcase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorize() {
  const tenant = await getTenant()
  if (!tenant) return { error: apiError('CLINIC_NOT_FOUND') }
  const session = await getSession()
  if (!session?.uid) return { error: apiError('UNAUTHORIZED') }
  const denied = forbid(session, 'settings:manage')
  if (denied) return { error: denied }
  return { tenant, session }
}

const fail = (e: unknown, tag: string) => {
  if (e instanceof ShowcaseError) return Response.json({ error: e.message }, { status: e.status })
  console.error(`[showcase-${tag}]`, e)
  return apiError('SERVER_ERROR')
}

// GET /api/doctor/showcase — the clinic's items, for Settings
export async function GET() {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    return Response.json({ items: await listShowcase(a.tenant) })
  } catch (e) { return fail(e, 'get') }
}

// POST /api/doctor/showcase — multipart: `file` (PDF or picture) and an optional `title`
export async function POST(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session } = a
    if (!(await rateLimit(tenantDb(tenant), `showcase:${session.uid}`, 30, 3600))) return apiError('RATE_LIMITED')

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return Response.json({ error: 'Choose a PDF or a picture to add' }, { status: 400 })

    const item = await addShowcaseItem(tenant, { size: file.size, data: Buffer.from(await file.arrayBuffer()), name: file.name }, form?.get('title'))
    await audit(tenant, session, 'showcase.add', `showcase/${item.id}`, { kind: item.kind, title: item.title })
    return Response.json({ item, items: await listShowcase(tenant) }, { status: 201 })
  } catch (e) { return fail(e, 'post') }
}

// PATCH /api/doctor/showcase — { order?: string[] } and/or { rename?: { id, title } }
export async function PATCH(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const body = await request.json().catch(() => null) as { order?: unknown; rename?: { id?: unknown; title?: unknown } } | null
    if (!body) return Response.json({ error: 'Nothing to change' }, { status: 400 })
    const order = Array.isArray(body.order) && body.order.every(x => typeof x === 'string') ? (body.order as string[]) : undefined
    const rename = body.rename && typeof body.rename.id === 'string' && typeof body.rename.title === 'string'
      ? { id: body.rename.id, title: body.rename.title } : undefined
    if (!order && !rename) return Response.json({ error: 'Nothing to change' }, { status: 400 })
    return Response.json({ items: await updateShowcase(a.tenant, { order, rename }) })
  } catch (e) { return fail(e, 'patch') }
}
