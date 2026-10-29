import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase/server'
import { getPlatformAdmin } from '@/lib/auth/platform'
import { parseBody } from '@/lib/validation'
import { patchClinicSchema as patchSchema } from '@/lib/adminSchemas'
import { isUsablePrimary } from '@/lib/tenant/theme'
import { apiError } from '@/lib/errors'

const deny = () => apiError('NOT_FOUND')

// PATCH — suspend/activate, change plan flags or theme, manage hostnames,
// or issue the owner a fresh password-reset link.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformAdmin())) return deny()
  const { id } = await params
  const parsed = await parseBody(request, patchSchema)
  if ('error' in parsed) return parsed.error
  const b = parsed.data

  try {
    // A clinic lives either in the new layout or (the original one) in doctors/.
    const scoped = adminDb.collection('clinics').doc(id)
    const legacy = adminDb.collection('doctors').doc(id)
    const [sSnap, lSnap] = await Promise.all([scoped.get(), legacy.get()])
    const ref = sSnap.exists ? scoped : lSnap.exists ? legacy : null
    if (!ref) return apiError('CLINIC_NOT_FOUND')
    const profile = ((sSnap.exists ? sSnap : lSnap).data() ?? {}) as any

    const update: Record<string, unknown> = {}
    if (b.status) update.status = b.status
    if (b.timezone) {
      try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }) } catch { return Response.json({ error: 'Unknown timezone' }, { status: 400 }) }
      update.timezone = b.timezone
    }
    if (b.features) for (const [k, v] of Object.entries(b.features)) update[`features.${k}`] = v
    if (b.theme) {
      if (b.theme.primary === null || b.theme.primary === '') update.theme = FieldValue.delete()
      else if (isUsablePrimary(b.theme.primary)) update.theme = { primary: b.theme.primary }
      else return Response.json({ error: 'Brand colour must be a darker #RRGGBB colour' }, { status: 400 })
    }
    if (Object.keys(update).length) await ref.update(update)

    if (b.addDomain) {
      const dref = adminDb.collection('domains').doc(b.addDomain)
      if ((await dref.get()).exists) return Response.json({ error: `${b.addDomain} is already mapped` }, { status: 409 })
      await dref.set({ clinicId: id, storage: sSnap.exists ? 'scoped' : 'legacy', timezone: b.timezone ?? profile.timezone ?? 'Asia/Kolkata' })
    }
    if (b.removeDomain) {
      const dref = adminDb.collection('domains').doc(b.removeDomain)
      const d = await dref.get()
      if (d.exists && (d.data() as any).clinicId === id) await dref.delete()
    }

    let link: string | undefined
    if (b.resetOwnerPassword) {
      const ownerEmail = profile.email as string | undefined
      if (!ownerEmail) return Response.json({ error: 'This clinic has no owner email on file' }, { status: 400 })
      link = await adminAuth.generatePasswordResetLink(ownerEmail)
    }

    // Suspension should end live sessions, not just hide the site.
    if (b.status === 'suspended' && profile.ownerUid) await adminAuth.revokeRefreshTokens(profile.ownerUid).catch(() => {})

    return Response.json({ ok: true, ...(link ? { passwordResetLink: link } : {}) })
  } catch (e) {
    console.error('[admin-clinic-patch]', e)
    return apiError('SERVER_ERROR')
  }
}
