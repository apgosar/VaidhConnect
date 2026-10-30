import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { tenantDb, type TenantDb } from '../db/tenant'
import type { Tenant } from '../tenant/types'
import { rateLimit } from '../ratelimit'
import { sendPinResetCode } from '../whatsapp'
import { patientRescheduleAllowance } from '../reschedulePolicy'

const scryptAsync = promisify(scrypt) as (pw: Buffer, salt: Buffer, keylen: number) => Promise<Buffer>

/**
 * Patient PINs. A 4-digit PIN is a low-entropy secret, so its safety comes from
 * (1) strict online lockouts, (2) hashing with a per-record salt plus a server
 * secret that a database leak alone doesn't reveal, and (3) not letting an
 * UNVERIFIED PIN open anything the clinic already holds.
 *
 * "Verified" means ownership of the phone number was established — by clinic
 * staff in person (setting the PIN at the desk) or by a code sent to the
 * patient's own WhatsApp. An unverified PIN (set remotely on first booking, by
 * whoever typed the number first) can only see the bookings made under it.
 */
export class PinError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSec?: number) {
    super(message)
  }
}

export const MAX_WRONG_TRIES = 5
export const LOCK_SECONDS = [15 * 60, 60 * 60, 24 * 60 * 60] // escalating: 15 min, 1 h, 24 h
const RESET_TTL_MS = 10 * 60 * 1000
const RESET_MAX_ATTEMPTS = 5

// ── secrets ────────────────────────────────────────────────────────────────
function secret(): string {
  const s = process.env.PATIENT_PIN_SECRET
  if (!s || s.length < 32) {
    throw new PinError(503, 'PIN_UNAVAILABLE', 'Online booking is temporarily unavailable. Please call the clinic to book.')
  }
  return s
}
/** Independent keys for independent purposes, all derived from the one secret. */
export const derivedKey = (purpose: string): Buffer => createHmac('sha256', secret()).update(purpose).digest()

/** Document id for a phone's access record. Keyed, so ids don't reveal phone numbers. */
export const accessIdFor = (phone: string): string =>
  createHmac('sha256', derivedKey('access-id')).update(phone).digest('hex').slice(0, 40)

// ── PIN policy ─────────────────────────────────────────────────────────────
const TRIVIAL = new Set([
  ...Array.from({ length: 10 }, (_, d) => String(d).repeat(4)),
  '0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  '1212', '2121', '1122', '2580', '0852', '1004', '2000', '1313', '6969',
])

/** Returns a message if the PIN is not acceptable, else null. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits'
  if (TRIVIAL.has(pin)) return 'That PIN is too easy to guess. Please choose a different one'
  return null
}

async function hashPin(pin: string, phone: string, salt: Buffer): Promise<Buffer> {
  const material = createHmac('sha256', derivedKey('pin')).update(`${phone}:${pin}`).digest()
  return scryptAsync(material, salt, 32)
}

const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

// ── records ────────────────────────────────────────────────────────────────
export interface Access {
  pinSalt?: string | null
  pinHash?: string | null
  pinVersion: number
  verified: boolean
  verifiedBy?: 'staff' | 'whatsapp' | null
  setBy?: 'patient' | 'staff' | 'whatsapp'
  failed: number
  lockLevel: number
  lockedUntil?: { toDate(): Date } | null
  resetCode?: { hash: string; expiresAt: { toDate(): Date }; attempts: number } | null
}

const ref = (db: TenantDb, phone: string) => db.col('patient_access').doc(accessIdFor(phone))

export async function getAccess(db: TenantDb, phone: string): Promise<(Access & { id: string }) | null> {
  const snap = await ref(db, phone).get()
  return snap.exists ? { id: snap.id, ...(snap.data() as Access) } : null
}

/** Whether a PIN is already set for this phone (used to word the PIN prompt). */
export async function hasPin(db: TenantDb, phone: string): Promise<boolean> {
  return !!(await getAccess(db, phone))?.pinHash
}

const fresh = (): Access => ({ pinVersion: 0, verified: false, failed: 0, lockLevel: 0, lockedUntil: null, resetCode: null })

// ── set / verify ───────────────────────────────────────────────────────────
/** First-time PIN chosen by the patient. Unverified: ownership of the number is not proven. */
export async function setInitialPin(db: TenantDb, phone: string, pin: string): Promise<{ accessId: string; pinVersion: number }> {
  const problem = pinProblem(pin)
  if (problem) throw new PinError(400, 'PIN_WEAK', problem)

  const salt = randomBytes(16)
  const pinHash = (await hashPin(pin, phone, salt)).toString('base64')
  const r = ref(db, phone)
  const now = new Date()

  const result = await r.firestore.runTransaction(async tx => {
    const snap = await tx.get(r)
    const cur = snap.data() as Access | undefined
    if (cur?.pinHash) return { exists: true as const }
    const pinVersion = (cur?.pinVersion ?? 0) + 1
    tx.set(r, {
      ...(cur ?? fresh()), pinSalt: salt.toString('base64'), pinHash, pinVersion,
      setBy: 'patient', verified: cur?.verified ?? false, failed: 0, lockLevel: 0, lockedUntil: null, resetCode: null,
      createdAt: now, updatedAt: now,
    })
    return { exists: false as const, pinVersion }
  })
  if (result.exists) throw new PinError(409, 'PIN_EXISTS', 'A PIN is already set for this number')
  return { accessId: r.id, pinVersion: result.pinVersion }
}

/**
 * Check a PIN. Wrong guesses are counted atomically (parallel guessing can't
 * beat the counter), and a locked number rejects even the right PIN.
 */
export async function verifyPin(db: TenantDb, phone: string, pin: string, now = new Date()) {
  const r = ref(db, phone)
  const snap0 = await r.get()
  const a0 = snap0.data() as Access | undefined
  if (!a0?.pinHash || !a0.pinSalt) throw new PinError(404, 'NO_PIN', 'No PIN is set for this number')

  const attempt = await hashPin(pin, phone, Buffer.from(a0.pinSalt, 'base64')) // scrypt outside the transaction
  const outcome = await r.firestore.runTransaction(async tx => {
    const s = await tx.get(r)
    const a = s.data() as Access
    const until = a.lockedUntil?.toDate()
    if (until && until > now) return { kind: 'locked' as const, retry: Math.ceil((until.getTime() - now.getTime()) / 1000) }

    if (a.pinHash === a0.pinHash && equal(attempt, Buffer.from(a.pinHash!, 'base64'))) {
      tx.update(r, { failed: 0, lockLevel: 0, lockedUntil: null, updatedAt: now })
      return { kind: 'ok' as const, access: a }
    }
    const failed = (a.failed ?? 0) + 1
    if (failed >= MAX_WRONG_TRIES) {
      const level = Math.min((a.lockLevel ?? 0) + 1, LOCK_SECONDS.length)
      const secs = LOCK_SECONDS[level - 1]
      tx.update(r, { failed: 0, lockLevel: level, lockedUntil: new Date(now.getTime() + secs * 1000), updatedAt: now })
      return { kind: 'now-locked' as const, retry: secs }
    }
    tx.update(r, { failed, updatedAt: now })
    return { kind: 'wrong' as const, left: MAX_WRONG_TRIES - failed }
  })

  if (outcome.kind === 'ok') return { accessId: r.id, pinVersion: outcome.access.pinVersion, verified: !!outcome.access.verified }
  if (outcome.kind === 'wrong') throw new PinError(401, 'PIN_WRONG', `Incorrect PIN. ${outcome.left} ${outcome.left === 1 ? 'try' : 'tries'} left.`)
  throw new PinError(429, 'PIN_LOCKED', `Too many wrong PINs. Try again in ${humanWait(outcome.retry)}, or reset your PIN.`, outcome.retry)
}

export function humanWait(seconds: number): string {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)} hour${seconds > 3600 ? 's' : ''}`
  return `${Math.ceil(seconds / 60)} minutes`
}

// ── clinic staff ───────────────────────────────────────────────────────────
/** Staff set a PIN with the patient present: ownership was checked in person, so it is verified. */
export async function staffSetPin(db: TenantDb, phone: string, pin: string) {
  const problem = pinProblem(pin)
  if (problem) throw new PinError(400, 'PIN_WEAK', problem)
  const salt = randomBytes(16)
  const pinHash = (await hashPin(pin, phone, salt)).toString('base64')
  const r = ref(db, phone)
  const now = new Date()
  await r.firestore.runTransaction(async tx => {
    const cur = (await tx.get(r)).data() as Access | undefined
    tx.set(r, {
      ...(cur ?? fresh()), pinSalt: salt.toString('base64'), pinHash, pinVersion: (cur?.pinVersion ?? 0) + 1,
      setBy: 'staff', verified: true, verifiedBy: 'staff', failed: 0, lockLevel: 0, lockedUntil: null, resetCode: null,
      createdAt: (cur as any)?.createdAt ?? now, updatedAt: now,
    })
  })
}

/** Forgot PIN: clear it and end every session. The patient chooses a new one on their next booking. */
export async function staffResetPin(db: TenantDb, phone: string) {
  const r = ref(db, phone)
  const now = new Date()
  await r.firestore.runTransaction(async tx => {
    const cur = (await tx.get(r)).data() as Access | undefined
    if (!cur) return
    tx.set(r, { ...cur, pinHash: null, pinSalt: null, pinVersion: (cur.pinVersion ?? 0) + 1, verified: false, verifiedBy: null, failed: 0, lockLevel: 0, lockedUntil: null, resetCode: null, updatedAt: now })
  })
}

// ── self-service reset by WhatsApp code ────────────────────────────────────
const codeHash = (code: string, phone: string) => createHmac('sha256', derivedKey('reset-code')).update(`${phone}:${code}`).digest('hex')

/**
 * Send a one-time code to the patient's OWN WhatsApp. Always answers the same
 * way, so it can't be used to discover which numbers have PINs.
 */
export async function requestPinReset(tenant: Tenant, phone: string, ip: string, now = new Date()): Promise<void> {
  const db = tenantDb(tenant)
  const allowed =
    (await rateLimit(db, `pinreset:phone:${phone}:min`, 1, 60)) &&
    (await rateLimit(db, `pinreset:phone:${phone}:hour`, 5, 3600)) &&
    (await rateLimit(db, `pinreset:ip:${ip}`, 10, 3600))
  if (!allowed) throw new PinError(429, 'RESET_RATE', 'Please wait a minute before asking for another code.')

  const code = String(randomInt(100000, 1000000))
  const r = ref(db, phone)
  await r.firestore.runTransaction(async tx => {
    const cur = (await tx.get(r)).data() as Access | undefined
    tx.set(r, { ...(cur ?? fresh()), resetCode: { hash: codeHash(code, phone), expiresAt: new Date(now.getTime() + RESET_TTL_MS), attempts: 0 }, updatedAt: now })
  })
  const sent = await sendPinResetCode(phone, { code })
  if (!sent) throw new PinError(502, 'RESET_SEND_FAILED', 'We could not send the code right now. Please call the clinic to reset your PIN.')
}

/** Check the code, then set the new PIN. Proving the code proves ownership, so the PIN is verified. */
export async function confirmPinReset(db: TenantDb, phone: string, code: string, newPin: string, now = new Date()) {
  const problem = pinProblem(newPin)
  if (problem) throw new PinError(400, 'PIN_WEAK', problem)

  const salt = randomBytes(16)
  const pinHash = (await hashPin(newPin, phone, salt)).toString('base64')
  const r = ref(db, phone)

  const outcome = await r.firestore.runTransaction(async tx => {
    const cur = (await tx.get(r)).data() as Access | undefined
    const rc = cur?.resetCode
    if (!cur || !rc || rc.expiresAt.toDate() < now) return { kind: 'expired' as const }
    if (rc.attempts >= RESET_MAX_ATTEMPTS) { tx.update(r, { resetCode: null }); return { kind: 'expired' as const } }
    if (!equal(Buffer.from(codeHash(code, phone), 'hex'), Buffer.from(rc.hash, 'hex'))) {
      tx.update(r, { resetCode: { ...rc, attempts: rc.attempts + 1 } })
      return { kind: 'wrong' as const }
    }
    tx.set(r, {
      ...cur, pinSalt: salt.toString('base64'), pinHash, pinVersion: (cur.pinVersion ?? 0) + 1, setBy: 'whatsapp',
      verified: true, verifiedBy: 'whatsapp', failed: 0, lockLevel: 0, lockedUntil: null, resetCode: null, updatedAt: now,
    })
    return { kind: 'ok' as const, pinVersion: (cur.pinVersion ?? 0) + 1 }
  })

  if (outcome.kind === 'wrong') throw new PinError(400, 'CODE_WRONG', 'That code is not correct.')
  if (outcome.kind === 'expired') throw new PinError(400, 'CODE_EXPIRED', 'That code has expired. Please ask for a new one.')
  return { accessId: r.id, pinVersion: outcome.pinVersion, verified: true }
}

// ── what a signed-in patient may see ───────────────────────────────────────
export interface PatientSession { phone: string; accessId: string; verified: boolean }

export interface MyAppointment {
  id: string; startTime: Date; endTime: Date; status: string; chiefComplaint: string | null; patientName: string | null
  /** Whether this patient may move it themselves right now, and if not why (see lib/reschedulePolicy). */
  canReschedule: boolean
  rescheduleReason?: string
  reschedulesLeft: number
}

/**
 * Appointments visible to a PIN session. Verified: every appointment for
 * patients on this phone number (including ones staff booked). Unverified: only
 * the bookings made under this PIN — never anything the clinic already held.
 */
export async function listMyAppointments(tenant: Tenant, session: PatientSession, now = new Date()): Promise<MyAppointment[]> {
  const db = tenantDb(tenant)
  const out = new Map<string, MyAppointment>()
  const add = (id: string, a: any, name: string | null) => {
    if (a.status !== 'BOOKED' || a.startTime.toDate() < now) return
    const start: Date = a.startTime.toDate()
    const allowance = patientRescheduleAllowance({ startTime: start, rescheduleCount: a.rescheduleCount }, now)
    out.set(id, { id, startTime: start, endTime: a.endTime.toDate(), status: a.status, chiefComplaint: a.chiefComplaint ?? null, patientName: name,
      canReschedule: allowance.allowed, rescheduleReason: allowance.reason, reschedulesLeft: allowance.left })
  }

  const names = new Map<string, string>()
  const patients = await db.col('patients').where('phone', '==', session.phone).get()
  patients.docs.forEach(d => names.set(d.id, d.data().name))

  if (session.verified) {
    for (const p of patients.docs) {
      const s = await db.col('appointments').where('patientId', '==', p.id).get()
      s.docs.forEach(d => add(d.id, d.data(), names.get(p.id) ?? null))
    }
  }
  const own = await db.col('appointments').where('accessId', '==', session.accessId).get()
  own.docs.forEach(d => add(d.id, d.data(), names.get(d.data().patientId) ?? null))

  return [...out.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

export interface MyVisit { appointmentId: string; prescriptionId: string; startTime: Date; patientName: string | null }

const MAX_VISITS = 30

/**
 * Past visits for which the clinic wrote a prescription, newest first. Same scope rule as
 * listMyAppointments: a verified PIN sees every visit on the number, an unverified one only
 * visits booked under it. Only dates and names are returned; the document itself is fetched
 * separately and re-checked.
 */
export async function listMyPrescriptions(tenant: Tenant, session: PatientSession, now = new Date()): Promise<MyVisit[]> {
  const db = tenantDb(tenant)
  const appts = new Map<string, any>()

  const names = new Map<string, string>()
  const patients = await db.col('patients').where('phone', '==', session.phone).get()
  patients.docs.forEach(d => names.set(d.id, d.data().name))

  if (session.verified) {
    for (const p of patients.docs) {
      const s = await db.col('appointments').where('patientId', '==', p.id).get()
      s.docs.forEach(d => appts.set(d.id, d.data()))
    }
  }
  const own = await db.col('appointments').where('accessId', '==', session.accessId).get()
  own.docs.forEach(d => appts.set(d.id, d.data()))

  const newest = [...appts.entries()]
    .filter(([, a]) => a.status !== 'CANCELLED' && a.startTime.toDate() <= now)
    .sort((x, y) => y[1].startTime.toDate().getTime() - x[1].startTime.toDate().getTime())
    .slice(0, MAX_VISITS)

  const visits: MyVisit[] = []
  for (const [id, a] of newest) {
    const rx = await db.col('prescriptions').where('appointmentId', '==', id).limit(1).get()
    if (rx.empty) continue
    visits.push({ appointmentId: id, prescriptionId: rx.docs[0].id, startTime: a.startTime.toDate(), patientName: names.get(a.patientId) ?? null })
  }
  return visits
}

/** May this PIN session cancel this appointment? (Same scope rule as listing.) */
export function sessionOwnsAppointment(session: PatientSession, appt: { accessId?: string }, patientPhone: string | null): boolean {
  if (appt.accessId && appt.accessId === session.accessId) return true
  return session.verified && !!patientPhone && patientPhone === session.phone
}

export const _hashForTests = (v: string) => createHash('sha256').update(v).digest('hex')
