import { adminAuth, adminDb } from '@/lib/firebase/server'
import { getPlatformAdmin } from '@/lib/auth/platform'
import { parseBody } from '@/lib/validation'
import { createClinicSchema as createSchema } from '@/lib/adminSchemas'
import { provisionClinic, ProvisionError } from '@/lib/modules/provisioning'
import { FEATURES } from '@/lib/tenant/features'

const deny = () => Response.json({ error: 'Not found' }, { status: 404 })

// GET — every clinic on the platform, with its hostnames and plan flags
export async function GET() {
  if (!(await getPlatformAdmin())) return deny()
  try {
    const [legacy, scoped, domains] = await Promise.all([
      adminDb.collection('doctors').get(),
      adminDb.collection('clinics').get(),
      adminDb.collection('domains').get(),
    ])
    const byClinic = new Map<string, string[]>()
    for (const d of domains.docs) {
      const c = (d.data() as any).clinicId as string
      byClinic.set(c, [...(byClinic.get(c) ?? []), d.id])
    }
    const row = (id: string, storage: 'legacy' | 'scoped', p: any) => ({
      id, storage,
      clinicName: p.clinicName ?? '(unnamed)', doctor: p.name ?? null, email: p.email ?? null,
      status: p.status ?? 'active', timezone: p.timezone ?? 'Asia/Kolkata',
      features: Object.fromEntries(FEATURES.map(f => [f, p.features?.[f] !== false])),
      theme: p.theme?.primary ?? null, domains: byClinic.get(id) ?? [],
      createdAt: p.createdAt?.toDate?.() ?? null,
    })
    const clinics = [
      ...legacy.docs.map(d => row(d.id, 'legacy', d.data())),
      ...scoped.docs.map(d => row(d.id, 'scoped', d.data())),
    ]
    return Response.json({ clinics, features: FEATURES })
  } catch (e) {
    console.error('[admin-clinics-get]', e)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — onboard a clinic
export async function POST(request: Request) {
  if (!(await getPlatformAdmin())) return deny()
  const parsed = await parseBody(request, createSchema)
  if ('error' in parsed) return parsed.error
  try {
    const r = await provisionClinic({ auth: adminAuth, db: adminDb }, parsed.data)
    return Response.json(r, { status: 201 })
  } catch (e) {
    if (e instanceof ProvisionError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[admin-clinics-post]', e)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
