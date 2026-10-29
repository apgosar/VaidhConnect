import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { patientDetailsSchema, parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'

// POST — staff register a patient (e.g. at the front desk). Public patient
// self-registration no longer exists: patients are created as part of a
// booking (see /api/appointments), which never reveals existing records.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const session = await getSession()
    if (!session?.uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const denied = forbid(session, 'patients:manage')
    if (denied) return denied

    const parsed = await parseBody(request, patientDetailsSchema)
    if ('error' in parsed) return parsed.error
    const d = parsed.data
    const db = tenantDb(tenant)

    const dup = (await db.col('patients').where('phone', '==', d.phone).get()).docs.find(x => {
      const p = x.data()
      return p.name?.trim().toLowerCase() === d.name.trim().toLowerCase() && p.dob?.toDate().toISOString().slice(0, 10) === d.dob
    })
    if (dup) return Response.json({ patient: { id: dup.id, ...dup.data(), dob: dup.data().dob?.toDate() } })

    const now = new Date()
    const data = {
      phone: d.phone, name: d.name.trim(), dob: new Date(`${d.dob}T00:00:00Z`),
      medicalHistory: d.medicalHistory || null, email: d.email || null,
      createdAt: now, updatedAt: now, createdBy: `staff:${session.uid}`,
    }
    const ref = db.col('patients').doc()
    await ref.set(data)
    await audit(tenant, session, 'patient.create', `patients/${ref.id}`)
    return Response.json({ patient: { id: ref.id, ...data } }, { status: 201 })
  } catch (error) {
    console.error('[patient-create]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — edit a patient's record (clinic users only).
export async function PUT(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const session = await getSession()
    if (!session?.uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const denied = forbid(session, 'patients:manage')
    if (denied) return denied

    const parsed = await parseBody(request, patientDetailsSchema.partial().extend({ id: patientDetailsSchema.shape.name.min(1) }))
    if ('error' in parsed) return parsed.error
    const { id, name, dob, medicalHistory, email } = parsed.data

    const ref = tenantDb(tenant).col('patients').doc(id)
    if (!(await ref.get()).exists) return Response.json({ error: 'Patient not found' }, { status: 404 })

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (name) update.name = name.trim()
    if (dob) update.dob = new Date(`${dob}T00:00:00Z`)
    if (medicalHistory !== undefined) update.medicalHistory = medicalHistory || null
    if (email !== undefined) update.email = email || null
    await ref.update(update)
    await audit(tenant, session, 'patient.update', `patients/${id}`)

    const p = (await ref.get()).data() as any
    return Response.json({ patient: { id, ...p, dob: p.dob?.toDate() } })
  } catch (error) {
    console.error('[patient-update]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
