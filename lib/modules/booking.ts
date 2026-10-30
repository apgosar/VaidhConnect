import { tenantDb, type TenantDb } from '../db/tenant'
import type { Tenant } from '../tenant/types'
import type { WeeklyTimings } from '../constants'
import { dayBoundsInTz, ymdInTz } from '../time'
import { rateLimit } from '../ratelimit'
import type { BookingInput, PatientDetails } from '../validation'
import { getDayAvailability } from './availability'
import { notifyBooked, notifyCancelled, notifyRescheduled } from './notifications'
import { patientRescheduleAllowance } from '../reschedulePolicy'
import { getAccess, sessionOwnsAppointment, setInitialPin, verifyPin, PinError, type PatientSession } from './patientAccess'

export class BookingError extends Error {
  /** `code` lets a screen react to a specific refusal (a taken slot, a used-up allowance) without parsing the text. */
  constructor(public status: number, message: string, public code?: string) { super(message) }
}

export type Actor =
  | { kind: 'public'; ip: string; session?: PatientSession | null }
  | { kind: 'staff'; uid: string }

const lockId = (doctorId: string, start: Date) => `${doctorId}_${start.getTime()}`

async function loadDoctor(db: TenantDb) {
  const snap = await db.profile().get()
  if (!snap.exists) throw new BookingError(503, 'Clinic not configured')
  return { id: snap.id, ...snap.data() } as any
}

/**
 * Find the patient record for these details, or create one. For public
 * callers existing records are matched but NEVER read back or modified — the
 * caller only ever learns the booking succeeded. (Without OTP, anyone can
 * type any number; exposing or editing records here would re-open that hole.)
 */
async function resolvePatient(db: TenantDb, details: PatientDetails, actor: Actor): Promise<{ id: string; data: any }> {
  const phone = details.phone
  const existing = await db.col('patients').where('phone', '==', phone).get()
  const name = details.name.trim().toLowerCase()
  const dob = details.dob
  const match = existing.docs.find(d => {
    const x = d.data()
    return x.name?.trim().toLowerCase() === name && x.dob?.toDate().toISOString().slice(0, 10) === dob
  })

  if (match) {
    if (actor.kind === 'staff') {
      const patch: Record<string, unknown> = {}
      if (details.email) patch.email = details.email
      if (details.medicalHistory) patch.medicalHistory = details.medicalHistory
      if (Object.keys(patch).length) await match.ref.update({ ...patch, updatedAt: new Date() })
    }
    return { id: match.id, data: match.data() }
  }

  const now = new Date()
  const data = {
    phone,
    name: details.name.trim(),
    dob: new Date(`${dob}T00:00:00Z`),
    medicalHistory: details.medicalHistory || null,
    email: details.email || null,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.kind,
  }
  const ref = db.col('patients').doc()
  await ref.set(data)
  return { id: ref.id, data }
}

export async function bookAppointment(tenant: Tenant, input: BookingInput, actor: Actor) {
  // Picking an existing patient by id is a staff-only power. Reject it before
  // anything else so a public caller can never reach record lookups.
  if (input.patientId && actor.kind !== 'staff') throw new BookingError(403, 'Not allowed')

  const db = tenantDb(tenant)
  const doctor = await loadDoctor(db)
  const start = new Date(input.startTime)
  const end = new Date(input.endTime)

  // 1. The requested slot must be a real, currently-open slot for this clinic.
  const ymd = ymdInTz(start, tenant.timezone)
  const day = await getDayAvailability(tenant, db, doctor as { id: string; timings: WeeklyTimings; slotDurationMins: number }, ymd)
  if (!day.slots.some(s => s.start === start.toISOString() && s.end === end.toISOString())) {
    throw new BookingError(409, 'This slot is no longer available')
  }

  // 2. Abuse limit for the public flow: every attempt counts against the caller's
  // IP. (The per-phone limit is applied below, only AFTER the PIN is proven —
  // otherwise someone who merely knows a number could use up its daily booking
  // budget with wrong guesses and lock the real owner out.)
  if (actor.kind === 'public' && !(await rateLimit(db, `book:ip:${actor.ip}`, 10, 3600))) {
    throw new BookingError(429, 'Too many booking attempts. Please try again later or call the clinic.')
  }

  // 2b. PIN gate for the public flow. A phone that already has a PIN needs it
  // (or a live PIN session) before anyone can book under that number, which
  // also stops strangers booking in someone else's name. A phone with no PIN
  // yet sets one now.
  let pinProof: { accessId: string; pinVersion: number; phone: string } | undefined
  if (actor.kind === 'public') {
    const phone = input.patient!.phone
    const access = await getAccess(db, phone)
    if (access?.pinHash) {
      if (actor.session && actor.session.phone === phone) {
        pinProof = { accessId: actor.session.accessId, pinVersion: access.pinVersion, phone }
      } else if (input.pin) {
        const v = await verifyPin(db, phone, input.pin)
        pinProof = { accessId: v.accessId, pinVersion: v.pinVersion, phone }
      } else {
        throw new PinError(401, 'PIN_REQUIRED', 'Enter your PIN to book with this number')
      }
    } else {
      if (!input.pin) throw new PinError(400, 'PIN_SETUP_REQUIRED', 'Choose a 4-digit PIN to continue')
      const s = await setInitialPin(db, phone, input.pin)
      pinProof = { accessId: s.accessId, pinVersion: s.pinVersion, phone }
    }
    // Proven owner of the PIN: now cap how many appointments one number can book a day.
    if (!(await rateLimit(db, `book:phone:${phone}`, 3, 24 * 3600))) {
      throw new BookingError(429, 'Too many bookings for this number today. Please call the clinic.')
    }
  }

  // 3. Who is the patient?
  let patient: { id: string; data: any }
  if (input.patientId) {
    const snap = await db.col('patients').doc(input.patientId).get()
    if (!snap.exists) throw new BookingError(404, 'Patient not found')
    patient = { id: snap.id, data: snap.data() }
  } else {
    patient = await resolvePatient(db, input.patient!, actor)
  }

  // 4. Reserve the slot atomically. A per-slot lock document makes two
  // simultaneous requests for the same slot contend on one key, so exactly
  // one wins; the overlap scan additionally guards bookings that predate
  // locks or sit on a different slot grid.
  const apptRef = db.col('appointments').doc()
  const lockRef = db.col('slot_locks').doc(lockId(doctor.id, start))
  const { start: dayStart, end: dayEnd } = dayBoundsInTz(start, tenant.timezone)
  const now = new Date()
  const diffHours = (start.getTime() - now.getTime()) / 3_600_000

  const appointment = {
    patientId: patient.id,
    doctorId: doctor.id,
    startTime: start,
    endTime: end,
    status: 'BOOKED',
    chiefComplaint: input.chiefComplaint || null,
    // Reminder flags by lead time: skip the 24h reminder if booked <24h out,
    // and the 1h cron if booked <1h out (that one is sent immediately).
    reminderSent24h: diffHours < 24,
    reminderSent1h: diffHours < 1,
    // Links a portal booking to the PIN that made it, so that PIN can list/cancel it.
    ...(pinProof ? { accessId: pinProof.accessId } : {}),
    createdBy: actor.kind === 'staff' ? `staff:${actor.uid}` : 'public',
    createdAt: now,
    updatedAt: now,
  }

  await apptRef.firestore.runTransaction(async tx => {
    const lock = await tx.get(lockRef)
    if (lock.exists) {
      const holder = lock.data()?.appointmentId as string | undefined
      const holderSnap = holder ? await tx.get(db.col('appointments').doc(holder)) : null
      if (holderSnap?.exists && holderSnap.data()?.status === 'BOOKED') {
        throw new BookingError(409, 'This slot is no longer available')
      }
      // otherwise the lock is stale (its appointment was cancelled) — reuse it
    }

    const sameDay = await tx.get(
      db.col('appointments').where('startTime', '>=', dayStart).where('startTime', '<=', dayEnd),
    )
    const clash = sameDay.docs.some(d => {
      const a = d.data()
      return a.doctorId === doctor.id && a.status === 'BOOKED' &&
        start < a.endTime.toDate() && end > a.startTime.toDate()
    })
    if (clash) throw new BookingError(409, 'This slot is no longer available')

    tx.create(apptRef, appointment)
    tx.set(lockRef, { appointmentId: apptRef.id, startTime: start, createdAt: now })
  })

  await notifyBooked(tenant, doctor, patient.data, { startTime: start })

  return {
    appointment: {
      id: apptRef.id,
      startTime: start,
      endTime: end,
      status: 'BOOKED',
      chiefComplaint: appointment.chiefComplaint,
      doctor: {
        name: doctor.name || 'Doctor',
        clinicName: doctor.clinicName || 'Clinic',
        address: doctor.address || undefined,
        phone: doctor.phone || undefined,
      },
    },
    patientId: patient.id,
    // For the caller to start a PIN session (public bookings only).
    pinSession: pinProof ? { phone: pinProof.phone, pinVersion: pinProof.pinVersion } : undefined,
  }
}

export type CancelAuth = { kind: 'staff'; uid: string } | { kind: 'patient'; session: PatientSession }

export async function cancelAppointment(tenant: Tenant, id: string, auth: CancelAuth) {
  const db = tenantDb(tenant)
  const ref = db.col('appointments').doc(id)
  let appt: any

  await ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new BookingError(404, 'Appointment not found')
    appt = snap.data()
    if (auth.kind === 'patient') {
      const patientPhone = appt.patientId ? (await tx.get(db.col('patients').doc(appt.patientId))).data()?.phone ?? null : null
      if (!sessionOwnsAppointment(auth.session, appt, patientPhone)) throw new BookingError(403, 'Not allowed')
    }
    if (appt.status !== 'BOOKED') throw new BookingError(409, 'This appointment is not active')
    tx.update(ref, { status: 'CANCELLED', cancelledBy: auth.kind === 'staff' ? `staff:${auth.uid}` : 'patient', updatedAt: new Date() })
    tx.delete(db.col('slot_locks').doc(lockId(appt.doctorId, appt.startTime.toDate())))
  })

  const [doctor, patientSnap] = await Promise.all([
    loadDoctor(db),
    appt.patientId ? db.col('patients').doc(appt.patientId).get() : null,
  ])
  if (patientSnap?.exists) await notifyCancelled(tenant, doctor, patientSnap.data() as any, { startTime: appt.startTime.toDate() })
}

/** Re-open a cancelled appointment, but only if its slot is still free. */
export async function reopenAppointment(tenant: Tenant, id: string) {
  const db = tenantDb(tenant)
  const ref = db.col('appointments').doc(id)

  await ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new BookingError(404, 'Appointment not found')
    const a = snap.data() as any
    if (a.status === 'BOOKED') return
    const start: Date = a.startTime.toDate(), end: Date = a.endTime.toDate()
    const { start: dayStart, end: dayEnd } = dayBoundsInTz(start, tenant.timezone)
    const lockRef = db.col('slot_locks').doc(lockId(a.doctorId, start))
    const lock = await tx.get(lockRef)
    const sameDay = await tx.get(db.col('appointments').where('startTime', '>=', dayStart).where('startTime', '<=', dayEnd))
    const taken = sameDay.docs.some(d => {
      const x = d.data()
      return d.id !== id && x.doctorId === a.doctorId && x.status === 'BOOKED' && start < x.endTime.toDate() && end > x.startTime.toDate()
    })
    if (taken || (lock.exists && lock.data()?.appointmentId !== id)) {
      const holder = lock.data()?.appointmentId
      const holderSnap = holder ? await tx.get(db.col('appointments').doc(holder)) : null
      if (taken || holderSnap?.data()?.status === 'BOOKED') throw new BookingError(409, 'That time slot has since been booked by someone else')
    }
    tx.update(ref, { status: 'BOOKED', updatedAt: new Date() })
    tx.set(lockRef, { appointmentId: id, startTime: start, createdAt: new Date() })
  })
}

export interface RescheduleInput { startTime: string; endTime: string }

/**
 * Move a booked appointment to another open slot. It is the SAME appointment (same id), so its prescription,
 * payment and links stay attached; only the time, the slot lock and the reminder flags change.
 *
 * Staff may move any appointment. A patient may move their own, subject to lib/reschedulePolicy (a limited
 * number of changes, and not close to the visit). The new slot gets the same checks as a new booking, and
 * the move is one transaction: the old slot is freed and the new one taken together, or neither.
 */
export async function rescheduleAppointment(tenant: Tenant, id: string, input: RescheduleInput, auth: CancelAuth) {
  const db = tenantDb(tenant)
  const doctor = await loadDoctor(db)
  const newStart = new Date(input.startTime)
  const newEnd = new Date(input.endTime)
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime()) || newEnd <= newStart) throw new BookingError(400, 'Choose a valid time')

  const ref = db.col('appointments').doc(id)
  const before = await ref.get()
  if (!before.exists) throw new BookingError(404, 'Appointment not found')

  // The new slot must be a real, currently open one for this clinic (same rule as booking).
  const day = await getDayAvailability(tenant, db, doctor as { id: string; timings: WeeklyTimings; slotDurationMins: number }, ymdInTz(newStart, tenant.timezone))
  if (!day.slots.some(s => s.start === newStart.toISOString() && s.end === newEnd.toISOString())) {
    throw new BookingError(409, 'This slot is no longer available', 'SLOT_TAKEN')
  }

  const now = new Date()
  const newLockRef = db.col('slot_locks').doc(lockId(doctor.id, newStart))
  const { start: dayStart, end: dayEnd } = dayBoundsInTz(newStart, tenant.timezone)
  let oldStart!: Date
  let patientId: string | null = null

  await ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new BookingError(404, 'Appointment not found')
    const a = snap.data() as any
    if (a.status !== 'BOOKED') throw new BookingError(409, 'This appointment is not active')
    oldStart = a.startTime.toDate()
    const oldEnd: Date = a.endTime.toDate()
    patientId = a.patientId ?? null

    if (auth.kind === 'patient') {
      const phone = a.patientId ? (await tx.get(db.col('patients').doc(a.patientId))).data()?.phone ?? null : null
      if (!sessionOwnsAppointment(auth.session, a, phone)) throw new BookingError(403, 'Not allowed')
      const allowance = patientRescheduleAllowance({ startTime: oldStart, rescheduleCount: a.rescheduleCount }, now)
      if (!allowance.allowed) throw new BookingError(409, allowance.reason!, 'RESCHEDULE_NOT_ALLOWED')
    }
    if (oldStart.getTime() === newStart.getTime()) throw new BookingError(400, 'That is the time it already has. Choose a different one.')

    // all reads first
    const oldLockRef = db.col('slot_locks').doc(lockId(a.doctorId, oldStart))
    const oldLock = await tx.get(oldLockRef)
    const newLock = await tx.get(newLockRef)
    const sameDay = await tx.get(db.col('appointments').where('startTime', '>=', dayStart).where('startTime', '<=', dayEnd))

    if (newLock.exists) {
      const holder = newLock.data()?.appointmentId as string | undefined
      if (holder && holder !== id) {
        const holderSnap = await tx.get(db.col('appointments').doc(holder))
        if (holderSnap.exists && holderSnap.data()?.status === 'BOOKED') throw new BookingError(409, 'This slot is no longer available', 'SLOT_TAKEN')
      }
    }
    const clash = sameDay.docs.some(d => {
      const x = d.data()
      return d.id !== id && x.doctorId === doctor.id && x.status === 'BOOKED' && newStart < x.endTime.toDate() && newEnd > x.startTime.toDate()
    })
    if (clash) throw new BookingError(409, 'This slot is no longer available', 'SLOT_TAKEN')

    const diffHours = (newStart.getTime() - now.getTime()) / 3_600_000
    tx.update(ref, {
      startTime: newStart,
      endTime: newEnd,
      // reminders restart for the new time, by the same lead-time rules as a fresh booking
      reminderSent24h: diffHours < 24,
      reminderSent1h: diffHours < 1,
      rescheduleCount: (a.rescheduleCount ?? 0) + 1,
      rescheduledFrom: { startTime: oldStart, endTime: oldEnd },
      rescheduledBy: auth.kind === 'staff' ? `staff:${auth.uid}` : 'patient',
      rescheduledAt: now,
      updatedAt: now,
    })
    if (oldLock.exists && oldLock.data()?.appointmentId === id) tx.delete(oldLockRef)
    tx.set(newLockRef, { appointmentId: id, startTime: newStart, createdAt: now })
  })

  const patientSnap = patientId ? await db.col('patients').doc(patientId).get() : null
  if (patientSnap?.exists) await notifyRescheduled(tenant, doctor, patientSnap.data() as any, { startTime: newStart }, oldStart)

  return { id, startTime: newStart, endTime: newEnd, previousStartTime: oldStart }
}
