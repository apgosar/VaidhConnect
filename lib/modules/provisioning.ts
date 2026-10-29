import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { DEFAULT_TIMINGS } from '../constants'
import { isUsablePrimary } from '../tenant/theme'

export class ProvisionError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface ProvisionInput {
  id: string
  name: string
  doctor: string
  email: string
  domain: string
  timezone?: string
  specialty?: string
  primary?: string
}

const RESERVED = new Set(['admin', 'api', 'www', 'new', 'default'])

function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}

/**
 * Onboard a clinic: profile, owner login (with clinicId + role claims) and the
 * host mapping. Shared by the operator console and the CLI, so both behave the
 * same. Every login belongs to exactly one clinic, so an existing account's
 * email is refused. If a later step fails, the earlier ones are undone.
 */
export async function provisionClinic(deps: { auth: Auth; db: Firestore }, input: ProvisionInput) {
  const { auth, db } = deps
  const id = input.id.trim().toLowerCase()
  const domain = input.domain.trim().toLowerCase()
  const email = input.email.trim().toLowerCase()
  const timezone = input.timezone?.trim() || 'Asia/Kolkata'

  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id) || RESERVED.has(id)) throw new ProvisionError(400, 'Clinic id must be 2–41 lowercase letters, digits or dashes')
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(domain) || domain.length > 200) throw new ProvisionError(400, 'Enter a valid domain name')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ProvisionError(400, 'Enter a valid owner email')
  if (!input.name.trim() || !input.doctor.trim()) throw new ProvisionError(400, 'Clinic name and doctor name are required')
  if (!validTimezone(timezone)) throw new ProvisionError(400, 'Unknown timezone')
  if (input.primary && !isUsablePrimary(input.primary)) throw new ProvisionError(400, 'Brand colour must be a darker #RRGGBB colour')

  const clinicRef = db.collection('clinics').doc(id)
  if ((await clinicRef.get()).exists || (await db.collection('doctors').doc(id).get()).exists) {
    throw new ProvisionError(409, `A clinic with id "${id}" already exists`)
  }
  if ((await db.collection('domains').doc(domain).get()).exists) throw new ProvisionError(409, `${domain} is already mapped to a clinic`)

  try { await auth.getUserByEmail(email); throw new ProvisionError(409, 'That email already has an account') }
  catch (e: any) { if (e instanceof ProvisionError) throw e; if (e.code !== 'auth/user-not-found') throw e }

  const user = await auth.createUser({ email, displayName: `Dr. ${input.doctor.trim()}` })
  try {
    await auth.setCustomUserClaims(user.uid, { clinicId: id, role: 'OWNER' })
    await clinicRef.set({
      clinicName: input.name.trim(),
      name: input.doctor.trim(),
      email,
      specialty: input.specialty?.trim() || 'General Physician',
      slotDurationMins: 15,
      timings: DEFAULT_TIMINGS,
      reminderIntervals: [24, 1],
      timezone,
      registrationNumber: 'Reg. No: Pending',
      youtubeLinks: [],
      products: [],
      pageViews: 0,
      features: {},
      status: 'active',
      ...(input.primary ? { theme: { primary: input.primary } } : {}),
      ownerUid: user.uid,
      createdAt: new Date(),
    })
    await clinicRef.collection('users').doc(user.uid).set({ email, name: input.doctor.trim(), role: 'OWNER', disabled: false, createdAt: new Date() })
    await db.collection('domains').doc(domain).set({ clinicId: id, storage: 'scoped', timezone })
  } catch (e) {
    await auth.deleteUser(user.uid).catch(() => {})
    await clinicRef.delete().catch(() => {})
    throw e
  }

  const link = await auth.generatePasswordResetLink(email)
  return { clinicId: id, domain, ownerUid: user.uid, passwordResetLink: link }
}
