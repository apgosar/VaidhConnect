import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { z } from 'zod'
import { parseBody } from '@/lib/validation'
import { apiError } from '@/lib/errors'
import { audit } from '@/lib/audit'
import { ymdInTz, toClinicLocal } from '@/lib/time'
import { BlockError, createBlocks, deleteBlock, listUpcomingBlocks, updateBlock } from '@/lib/modules/blocks'

// Times are the CLINIC's clock ("2026-11-02T14:30") or an ISO time with an offset; see lib/modules/blocks.ts.
const when = z.string().min(1).max(40)
const createSchema = z.object({
  start: when.optional(), end: when.optional(),
  // the older field names, still accepted
  startTime: when.optional(), endTime: when.optional(),
  reason: z.string().trim().max(200).optional().nullable(),
  repeat: z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional(),
})
const updateSchema = z.object({ id: z.string().min(1).max(128), start: when, end: when, reason: z.string().trim().max(200).optional().nullable() })
const deleteSchema = z.object({ id: z.string().min(1).max(128), scope: z.enum(['this', 'series']).optional() })

const view = (b: any) => ({ ...b, startTime: b.startTime, endTime: b.endTime })

async function authorize() {
  const tenant = await getTenant()
  if (!tenant) return { error: apiError('CLINIC_NOT_FOUND') }
  const session = await getSession()
  if (!session?.uid) return { error: apiError('UNAUTHORIZED') }
  const denied = forbid(session, 'blocked:manage')
  if (denied) return { error: denied }
  return { tenant, session }
}

const fail = (error: unknown, tag: string) => {
  if (error instanceof BlockError) return Response.json({ error: error.message }, { status: error.status })
  console.error(tag, error)
  return apiError('SERVER_ERROR')
}

// GET — blocked periods.
//   no range: the periods that have not finished yet (Block Schedule page). Past blocks are not returned.
//   ?from=&to=: every block overlapping that window (the calendar).
export async function GET(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant } = a
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    if (!from && !to) {
      const now = new Date()
      return Response.json({
        blocks: (await listUpcomingBlocks(tenant, now)).map(view),
        timezone: tenant.timezone,
        today: ymdInTz(now, tenant.timezone),
        nowLocal: toClinicLocal(now, tenant.timezone),
      })
    }

    // Overlap query (see the calendar): a multi-day block that began before `from` must still show.
    // Firestore allows one inequality field, so startTime <= to is filtered here and endTime >= from in memory.
    let query: any = tenantDb(tenant).col('blocked_slots').where('doctorId', '==', tenant.clinicId)
    if (to) query = query.where('startTime', '<=', new Date(to))
    const snapshot = await query.orderBy('startTime', 'asc').get()
    let blocks = snapshot.docs.map((doc: any) => {
      const data = doc.data()
      return { id: doc.id, ...data, startTime: data.startTime?.toDate(), endTime: data.endTime?.toDate() }
    })
    if (from) { const fromDate = new Date(from); blocks = blocks.filter((b: any) => b.endTime >= fromDate) }
    return Response.json({ blocks })
  } catch (error) {
    return fail(error, '[blocked-get]')
  }
}

// POST — block a period, optionally repeating weekly. Answers with any booked appointments the block covers.
export async function POST(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session } = a
    const parsed = await parseBody(request, createSchema)
    if ('error' in parsed) return parsed.error
    const { start, end, startTime, endTime, reason, repeat } = parsed.data

    const result = await createBlocks(tenant, { start: start ?? startTime ?? '', end: end ?? endTime ?? '', reason, repeat })
    await audit(tenant, session, 'block.create', `blocks/${result.blocks[0].id}`, { count: result.blocks.length })
    return Response.json({ blocks: result.blocks.map(view), block: view(result.blocks[0]), conflicts: result.conflicts }, { status: 201 })
  } catch (error) {
    return fail(error, '[blocked-post]')
  }
}

// PATCH — edit one blocked period.
export async function PATCH(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session } = a
    const parsed = await parseBody(request, updateSchema)
    if ('error' in parsed) return parsed.error
    const { id, start, end, reason } = parsed.data

    const block = await updateBlock(tenant, id, { start, end, reason })
    await audit(tenant, session, 'block.update', `blocks/${id}`)
    return Response.json({ block: view(block), conflicts: block.conflicts })
  } catch (error) {
    return fail(error, '[blocked-patch]')
  }
}

// DELETE — remove one blocked period, or (scope: "series") the rest of its weekly series.
export async function DELETE(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session } = a
    const parsed = await parseBody(request, deleteSchema)
    if ('error' in parsed) return parsed.error
    const removed = await deleteBlock(tenant, parsed.data.id, parsed.data.scope ?? 'this')
    await audit(tenant, session, 'block.delete', `blocks/${parsed.data.id}`, { removed })
    return Response.json({ message: 'Deleted', removed })
  } catch (error) {
    return fail(error, '[blocked-delete]')
  }
}
