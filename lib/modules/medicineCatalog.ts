import { createHash } from 'node:crypto'
import type { TenantDb } from '../db/tenant'
import type { Medicine } from '../constants'

/**
 * The medicines a clinic has prescribed before, remembered per clinic so the prescription form can
 * suggest them as the doctor types (and fill in the dose they used last time). It is built from
 * the doctor's own prescriptions only; there is no shared or built-in drug list.
 */
export interface CatalogEntry {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions?: string
  taper?: Medicine['taper']
  uses: number
}

/** Lower-case, single spaces: "  Paracetamol  500" and "paracetamol 500" are the same medicine. */
export const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

const idFor = (normalized: string) => createHash('sha256').update(normalized).digest('hex').slice(0, 24)

/** Record the medicines a prescription uses. Only medicines that were not already on the prescription count as a new use. */
export async function rememberMedicines(db: TenantDb, medicines: Medicine[], alreadyOnPrescription: string[] = [], now = new Date()) {
  const skip = new Set(alreadyOnPrescription.map(normalizeName))
  const seen = new Set<string>()
  for (const m of medicines) {
    const key = normalizeName(m.name ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    const ref = db.col('medicine_catalog').doc(idFor(key))
    const prev = (await ref.get()).data() as { uses?: number } | undefined
    const entry: Record<string, unknown> = {
      name: m.name.trim(),
      nameLower: key,
      // The latest way it was prescribed is what gets suggested next time.
      dosage: m.dosage ?? '',
      frequency: m.frequency ?? '',
      duration: m.duration ?? '',
      instructions: m.instructions ?? null,
      taper: m.taper ?? null,
      uses: (prev?.uses ?? 0) + (skip.has(key) ? 0 : 1),
      lastUsedAt: now,
    }
    await ref.set(entry)
  }
}

const MIN_QUERY = 2
const LIMIT = 8

/** Medicines whose name starts with what was typed, most used first. */
export async function searchMedicines(db: TenantDb, query: string): Promise<CatalogEntry[]> {
  const q = normalizeName(query)
  if (q.length < MIN_QUERY) return []
  const snap = await db.col('medicine_catalog')
    .where('nameLower', '>=', q)
    .where('nameLower', '<', q + '')
    .limit(40)
    .get()
  return snap.docs
    .map((d: any) => d.data())
    .sort((a: any, b: any) => (b.uses ?? 0) - (a.uses ?? 0) || a.nameLower.localeCompare(b.nameLower))
    .slice(0, LIMIT)
    .map((e: any): CatalogEntry => ({
      name: e.name,
      dosage: e.dosage ?? '',
      frequency: e.frequency ?? '',
      duration: e.duration ?? '',
      instructions: e.instructions ?? undefined,
      taper: e.taper ?? undefined,
      uses: e.uses ?? 0,
    }))
}
