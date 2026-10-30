import { tenantDb, type TenantDb } from '../db/tenant'
import type { Tenant } from '../tenant/types'
import { addDaysYmd, isValidYmd, parseClinicLocal, ymdInTz, toClinicLocal } from '../time'

/**
 * The doctor's blocked periods ("Block Schedule"): time patients cannot book. Times the doctor types are the
 * CLINIC's wall clock (see parseClinicLocal), not the browser's.
 */
export class BlockError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface BlockInput {
  /** "YYYY-MM-DDTHH:mm" on the clinic's clock, or an ISO time with an offset. */
  start: string
  end: string
  reason?: string | null
  /** Repeat the same hours every week until this clinic-local date (inclusive). */
  repeat?: { until: string }
}

export interface Conflict { id: string; patientName: string; startTime: Date }
export interface BlockView {
  id: string
  startTime: Date
  endTime: Date
  reason: string | null
  seriesId: string | null
  /** Booked appointments that fall inside this block. They are NOT cancelled; the doctor decides. */
  conflicts: Conflict[]
}

export const MAX_REPEATS = 52
const MAX_SPAN_DAYS = 366
// An appointment is never longer than this, so looking this far back catches one that began before a block does.
const LOOKBACK_MS = 12 * 3_600_000

/** A time the doctor typed (clinic clock) or an ISO time with an offset, as a UTC instant. */
export function parseWhen(value: unknown, tz: string): Date | null {
  if (typeof value !== 'string') return null
  const local = parseClinicLocal(value, tz)
  if (local) return local
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

const clean = (reason: unknown) => (typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : null)

function span(start: Date, end: Date, now: Date) {
  if (end <= start) throw new BlockError(400, 'End time must be after start time')
  if (end.getTime() - start.getTime() > MAX_SPAN_DAYS * 86_400_000) throw new BlockError(400, 'A block can cover at most a year. Split it into shorter ones.')
  if (end <= now) throw new BlockError(400, 'That period has already passed')
}

/** BOOKED appointments overlapping [start, end). */
export async function findConflicts(db: TenantDb, start: Date, end: Date): Promise<Conflict[]> {
  const snap = await db.col('appointments')
    .where('startTime', '>=', new Date(start.getTime() - LOOKBACK_MS))
    .where('startTime', '<', end)
    .get()
  const hits = snap.docs.filter((d: any) => {
    const a = d.data()
    return a.status === 'BOOKED' && a.endTime.toDate() > start && a.startTime.toDate() < end
  })
  return Promise.all(hits.map(async (d: any) => {
    const a = d.data()
    const patient = a.patientId ? (await db.col('patients').doc(a.patientId).get()).data() : null
    return { id: d.id, patientName: (patient?.name as string | undefined) ?? 'Patient', startTime: a.startTime.toDate() as Date }
  }))
}

const toView = (id: string, d: any, conflicts: Conflict[]): BlockView => ({
  id, startTime: d.startTime.toDate(), endTime: d.endTime.toDate(), reason: d.reason ?? null, seriesId: d.seriesId ?? null, conflicts,
})

/** Blocks that have not finished yet (in progress or in the future), soonest first. Past blocks are not returned. */
export async function listUpcomingBlocks(tenant: Tenant, now = new Date()): Promise<BlockView[]> {
  const db = tenantDb(tenant)
  const snap = await db.col('blocked_slots').where('endTime', '>=', now).get()
  const docs = snap.docs
    .filter((d: any) => d.data().doctorId === tenant.clinicId)
    .sort((a: any, b: any) => a.data().startTime.toDate().getTime() - b.data().startTime.toDate().getTime())
    .slice(0, 100)
  if (docs.length === 0) return []

  // one appointment query for the whole range, matched to each block in memory
  const first = docs[0].data().startTime.toDate() as Date
  const last = docs.reduce((m: Date, d: any) => (d.data().endTime.toDate() > m ? d.data().endTime.toDate() : m), new Date(0)) as Date
  const appts = (await db.col('appointments').where('startTime', '>=', new Date(first.getTime() - LOOKBACK_MS)).where('startTime', '<', last).get()).docs
    .filter((d: any) => d.data().status === 'BOOKED')
  const names = new Map<string, string>()
  const nameOf = async (patientId?: string) => {
    if (!patientId) return 'Patient'
    if (!names.has(patientId)) names.set(patientId, ((await db.col('patients').doc(patientId).get()).data()?.name as string | undefined) ?? 'Patient')
    return names.get(patientId)!
  }

  const views: BlockView[] = []
  for (const d of docs) {
    const b = d.data()
    const s: Date = b.startTime.toDate(), e: Date = b.endTime.toDate()
    const inside = appts.filter((x: any) => x.data().endTime.toDate() > s && x.data().startTime.toDate() < e)
    const conflicts = await Promise.all(inside.map(async (x: any) => ({ id: x.id, patientName: await nameOf(x.data().patientId), startTime: x.data().startTime.toDate() as Date })))
    views.push(toView(d.id, b, conflicts))
  }
  return views
}

/** The weekly occurrences of a block, as [start, end] pairs. DST-safe: the clinic's wall clock repeats, not a fixed number of hours. */
function weeklyOccurrences(start: Date, end: Date, untilYmd: string, tz: string): Array<[Date, Date]> {
  const startLocal = toClinicLocal(start, tz)
  const endLocal = toClinicLocal(end, tz)
  const startYmd = startLocal.slice(0, 10)
  const endYmd = endLocal.slice(0, 10)
  const startTime = startLocal.slice(11), endTime = endLocal.slice(11)
  const dayOffset = Math.round((Date.UTC(+endYmd.slice(0, 4), +endYmd.slice(5, 7) - 1, +endYmd.slice(8, 10)) - Date.UTC(+startYmd.slice(0, 4), +startYmd.slice(5, 7) - 1, +startYmd.slice(8, 10))) / 86_400_000)
  const out: Array<[Date, Date]> = []
  for (let k = 0; k <= MAX_REPEATS; k++) {
    const day = addDaysYmd(startYmd, 7 * k)
    if (day > untilYmd) break
    const s = parseClinicLocal(`${day}T${startTime}`, tz)!
    const e = parseClinicLocal(`${addDaysYmd(day, dayOffset)}T${endTime}`, tz)!
    out.push([s, e])
  }
  return out
}

/** Create a block, or a weekly series of them. Returns what was created and any booked appointments inside it. */
export async function createBlocks(tenant: Tenant, input: BlockInput, now = new Date()): Promise<{ blocks: BlockView[]; conflicts: Conflict[] }> {
  const db = tenantDb(tenant)
  const start = parseWhen(input.start, tenant.timezone)
  const end = parseWhen(input.end, tenant.timezone)
  if (!start || !end) throw new BlockError(400, 'Enter a valid start and end time')
  span(start, end, now)

  let periods: Array<[Date, Date]> = [[start, end]]
  let seriesId: string | null = null
  if (input.repeat) {
    if (!isValidYmd(input.repeat.until)) throw new BlockError(400, 'Enter a valid date to repeat until')
    if (input.repeat.until < ymdInTz(start, tenant.timezone)) throw new BlockError(400, 'The repeat date cannot be before the first block')
    periods = weeklyOccurrences(start, end, input.repeat.until, tenant.timezone)
    if (periods.length > MAX_REPEATS) throw new BlockError(400, `A weekly block can repeat at most ${MAX_REPEATS} times. Choose an earlier end date.`)
    seriesId = db.col('blocked_slots').doc().id
  }

  const reason = clean(input.reason)
  const created: BlockView[] = []
  const stamp = new Date()
  for (const [s, e] of periods) {
    const ref = db.col('blocked_slots').doc()
    const data = { doctorId: tenant.clinicId, startTime: s, endTime: e, reason, ...(seriesId ? { seriesId } : {}), createdAt: stamp, updatedAt: stamp }
    await ref.set(data)
    created.push({ id: ref.id, startTime: s, endTime: e, reason, seriesId, conflicts: [] })
  }

  // booked appointments that these blocks now cover (checked once per block)
  const conflicts: Conflict[] = []
  const seen = new Set<string>()
  for (const b of created) {
    b.conflicts = await findConflicts(db, b.startTime, b.endTime)
    for (const c of b.conflicts) if (!seen.has(c.id)) { seen.add(c.id); conflicts.push(c) }
  }
  return { blocks: created, conflicts }
}

/** Edit one block (time and/or reason). */
export async function updateBlock(tenant: Tenant, id: string, input: Omit<BlockInput, 'repeat'>, now = new Date()): Promise<BlockView> {
  const db = tenantDb(tenant)
  const ref = db.col('blocked_slots').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.doctorId !== tenant.clinicId) throw new BlockError(404, 'Block not found')

  const start = parseWhen(input.start, tenant.timezone)
  const end = parseWhen(input.end, tenant.timezone)
  if (!start || !end) throw new BlockError(400, 'Enter a valid start and end time')
  span(start, end, now)

  const reason = clean(input.reason)
  await ref.update({ startTime: start, endTime: end, reason, updatedAt: new Date() })
  return { id, startTime: start, endTime: end, reason, seriesId: snap.data()?.seriesId ?? null, conflicts: await findConflicts(db, start, end) }
}

/** Remove one block, or every remaining block of its weekly series (past ones are left alone). */
export async function deleteBlock(tenant: Tenant, id: string, scope: 'this' | 'series' = 'this', now = new Date()): Promise<number> {
  const db = tenantDb(tenant)
  const ref = db.col('blocked_slots').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.doctorId !== tenant.clinicId) throw new BlockError(404, 'Block not found')

  const seriesId = snap.data()?.seriesId as string | undefined
  if (scope === 'series' && seriesId) {
    const rest = await db.col('blocked_slots').where('seriesId', '==', seriesId).get()
    const mine = rest.docs.filter((d: any) => d.data().doctorId === tenant.clinicId && d.data().endTime.toDate() >= now)
    await Promise.all(mine.map((d: any) => d.ref.delete()))
    return mine.length
  }
  await ref.delete()
  return 1
}
