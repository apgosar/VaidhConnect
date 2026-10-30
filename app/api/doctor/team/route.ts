import { z } from 'zod'
import { adminAuth } from '@/lib/firebase/server'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { sendEmail } from '@/lib/email'
import { audit } from '@/lib/audit'
import { apiError } from '@/lib/errors'

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  name: z.string().trim().min(2).max(100),
  role: z.enum(['DOCTOR', 'STAFF']),
})
const updateSchema = z.object({
  uid: z.string().min(1).max(128),
  role: z.enum(['DOCTOR', 'STAFF']).optional(),
  disabled: z.boolean().optional(),
})

async function owner() {
  const tenant = await getTenant()
  if (!tenant) return { error: apiError('CLINIC_NOT_FOUND') }
  const session = await getSession()
  if (!session?.uid) return { error: apiError('UNAUTHORIZED') }
  const denied = forbid(session, 'team:manage')
  if (denied) return { error: denied }
  return { tenant, session, db: tenantDb(tenant) }
}

// GET — everyone who can sign in to this clinic
export async function GET() {
  try {
    const a = await owner()
    if ('error' in a) return a.error
    const { tenant, db } = a

    const snap = await db.col('users').get()
    const members = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }))
    // The clinic's original owner login predates the users collection.
    if (!members.some(m => m.role === 'OWNER')) {
      const profile = (await db.profile().get()).data() as any
      const ownerUid = profile?.ownerUid ?? (tenant.storage === 'legacy' ? tenant.clinicId : undefined)
      if (ownerUid) members.unshift({ uid: ownerUid, email: profile?.email ?? null, name: profile?.name ?? null, role: 'OWNER' })
    }
    return Response.json({ members })
  } catch (error) {
    console.error('[team-get]', error)
    return apiError('SERVER_ERROR')
  }
}

// POST — add a doctor or front-desk user. They get a one-time link to set
// their own password; nobody ever chooses another person's password.
export async function POST(request: Request) {
  try {
    const a = await owner()
    if ('error' in a) return a.error
    const { tenant, session, db } = a

    const parsed = await parseBody(request, inviteSchema)
    if ('error' in parsed) return parsed.error
    const { email, name, role } = parsed.data

    // One login belongs to exactly one clinic, so an address already in use
    // anywhere on the platform can't be added here.
    try {
      await adminAuth.getUserByEmail(email)
      return Response.json({ error: 'That email already has an account. Use a different email address.' }, { status: 409 })
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') throw e
    }

    const user = await adminAuth.createUser({ email, displayName: name })
    await adminAuth.setCustomUserClaims(user.uid, { clinicId: tenant.clinicId, role })
    await db.col('users').doc(user.uid).set({ email, name, role, disabled: false, createdAt: new Date(), createdBy: session.uid })

    const link = await adminAuth.generatePasswordResetLink(email)
    const clinicName = ((await db.profile().get()).data() as any)?.clinicName ?? 'your clinic'
    const emailed = await sendEmail({
      to: email,
      subject: `You have been added to ${clinicName}`,
      html: `<p>Hi ${name.replace(/[<>&"]/g, '')},</p><p>You can now sign in to ${clinicName.replace(/[<>&"]/g, '')}. Set your password here:</p><p><a href="${link}">Set your password</a></p>`,
    })

    await audit(tenant, session, 'team.invite', `users/${user.uid}`, { role })
    // If email isn't configured the owner can pass the link on themselves.
    return Response.json({ member: { uid: user.uid, email, name, role }, emailed, ...(emailed ? {} : { link }) }, { status: 201 })
  } catch (error) {
    console.error('[team-invite]', error)
    return apiError('SERVER_ERROR')
  }
}

// PATCH — change a member's role or switch their access off/on
export async function PATCH(request: Request) {
  try {
    const a = await owner()
    if ('error' in a) return a.error
    const { tenant, session, db } = a

    const parsed = await parseBody(request, updateSchema)
    if ('error' in parsed) return parsed.error
    const { uid, role, disabled } = parsed.data
    if (uid === session.uid) return Response.json({ error: 'You cannot change your own access' }, { status: 400 })

    const ref = db.col('users').doc(uid)
    const member = await ref.get()
    // Only members of THIS clinic can be touched, and never an owner.
    if (!member.exists || member.data()?.role === 'OWNER') {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = {}
    if (role) {
      await adminAuth.setCustomUserClaims(uid, { clinicId: tenant.clinicId, role })
      update.role = role
    }
    if (disabled !== undefined) {
      await adminAuth.updateUser(uid, { disabled })
      update.disabled = disabled
    }
    // Make the change take effect now, not when their session expires.
    await adminAuth.revokeRefreshTokens(uid)
    await ref.update(update)
    await audit(tenant, session, 'team.update', `users/${uid}`, update)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[team-update]', error)
    return apiError('SERVER_ERROR')
  }
}
