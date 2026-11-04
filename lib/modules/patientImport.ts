import { tenantDb } from '@/lib/db/tenant'
import type { Tenant } from '@/lib/tenant/types'
import { ymdInTz } from '@/lib/time'
import {
  MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, checkRow, isRejected, mapHeaders, parseCsv, personKey,
  type ImportRow, type RejectedRow,
} from '@/lib/patientImport'

export class ImportError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface ImportPlan {
  total: number
  /** Will be added. */
  fresh: ImportRow[]
  /** Already in the clinic (same name on the same number): left alone. */
  existing: { line: number; name: string }[]
  /** Repeated inside the file itself: only the first is added. */
  repeated: { line: number; name: string }[]
  /** Cannot be imported as written: the clinic fixes these in the file and uploads again. */
  rejected: RejectedRow[]
}

/** Reads the file and sorts every line into new, already there, repeated or needing a fix. Writes nothing. */
export async function planImport(tenant: Tenant, csv: string, options: { approximate: boolean }): Promise<ImportPlan> {
  if (csv.length > MAX_IMPORT_BYTES) throw new ImportError(400, 'That file is too large. Please use one under 2 MB.')
  const rows = parseCsv(csv)
  if (rows.length < 2) throw new ImportError(400, 'The file has no patients in it.')
  const head = mapHeaders(rows[0])
  if ('error' in head) throw new ImportError(400, head.error)
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new ImportError(400, `The file has more than ${MAX_IMPORT_ROWS} patients. Please split it into smaller files.`)

  const today = ymdInTz(new Date(), tenant.timezone)
  const have = new Set<string>()
  for (const d of (await tenantDb(tenant).col('patients').get()).docs) {
    const p = d.data()
    if (p.name && p.phone) have.add(personKey(p.name, p.phone))
  }

  const plan: ImportPlan = { total: rows.length - 1, fresh: [], existing: [], repeated: [], rejected: [] }
  const seen = new Set<string>()
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    const r = checkRow(cells, head.columns, line, today, options.approximate)
    if (isRejected(r)) { plan.rejected.push(r); return }
    const key = personKey(r.name, r.phone)
    if (have.has(key)) plan.existing.push({ line, name: r.name })
    else if (seen.has(key)) plan.repeated.push({ line, name: r.name })
    else { seen.add(key); plan.fresh.push(r) }
  })
  return plan
}

/** Adds the new patients, in groups (Firestore allows 500 writes at once). Safe to run again: the plan skips whoever is already there. */
export async function applyImport(tenant: Tenant, plan: ImportPlan, by: string): Promise<number> {
  const db = tenantDb(tenant)
  const now = new Date()
  for (let i = 0; i < plan.fresh.length; i += 400) {
    const batch = db.col('patients').firestore.batch()
    for (const r of plan.fresh.slice(i, i + 400)) {
      batch.set(db.col('patients').doc(), {
        phone: r.phone, name: r.name, dob: new Date(`${r.dob}T00:00:00Z`),
        ...(r.dobApproximate ? { dobApproximate: true } : {}),
        ...(r.gender ? { gender: r.gender } : {}),
        medicalHistory: r.medicalHistory || null, email: r.email || null,
        ...(r.legacyId ? { legacyId: r.legacyId } : {}),
        createdAt: now, updatedAt: now, createdBy: `import:${by}`,
      })
    }
    await batch.commit()
  }
  return plan.fresh.length
}
