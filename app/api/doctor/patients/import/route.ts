import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/ratelimit'
import { apiError } from '@/lib/errors'
import { applyImport, planImport, ImportError } from '@/lib/modules/patientImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SHOWN = 200 // lines listed back to the screen; the counts always cover everything

/**
 * POST /api/doctor/patients/import  { csv: string, approximate?: boolean, commit?: boolean }
 * Without `commit` it only reports what would happen (a preview). With `commit` the file is checked again on the
 * server and the new patients are written; the screen's earlier preview is never trusted.
 */
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'settings:manage')
    if (denied) return denied

    const body = await request.json().catch(() => null) as { csv?: unknown; approximate?: unknown; commit?: unknown } | null
    if (!body || typeof body.csv !== 'string' || !body.csv.trim()) return Response.json({ error: 'Choose a CSV file to import' }, { status: 400 })
    const commit = body.commit === true
    if (commit && !(await rateLimit(tenantDb(tenant), `import:${session.uid}`, 10, 3600))) return apiError('RATE_LIMITED')

    const plan = await planImport(tenant, body.csv, { approximate: body.approximate !== false })
    let added = 0
    if (commit) {
      added = await applyImport(tenant, plan, session.uid)
      await audit(tenant, session, 'patient.import', 'patients', { added, existing: plan.existing.length, repeated: plan.repeated.length, rejected: plan.rejected.length })
    }
    return Response.json({
      committed: commit, added,
      total: plan.total, newCount: plan.fresh.length, existingCount: plan.existing.length, repeatedCount: plan.repeated.length, rejectedCount: plan.rejected.length,
      rejected: plan.rejected.slice(0, SHOWN), repeated: plan.repeated.slice(0, SHOWN),
      sample: plan.fresh.slice(0, 5).map(r => ({ name: r.name, phone: r.phone, dob: r.dob, gender: r.gender ?? null })),
    })
  } catch (e) {
    if (e instanceof ImportError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[patient-import]', e)
    return apiError('SERVER_ERROR')
  }
}
