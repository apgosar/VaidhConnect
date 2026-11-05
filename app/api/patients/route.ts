import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { can, forbid } from '@/lib/auth/access'
import { patientDetailsSchema, parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { apiError } from '@/lib/errors'
import { deleteFile } from '@/lib/storage'

// POST — staff register a patient (e.g. at the front desk). Public patient
// self-registration no longer exists: patients are created as part of a
// booking (see /api/appointments), which never reveals existing records.
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'patients:manage')
    if (denied) return denied

    const parsed = await parseBody(request, patientDetailsSchema)
    if ('error' in parsed) return parsed.error
    const d = parsed.data
    const db = tenantDb(tenant)

    const dup = (await db.col('patients').where('phone', '==', d.phone).get()).docs.find(x => {
      const p = x.data()
      return p.name?.trim().toLowerCase() === d.name.trim().toLowerCase() &&
        (d.dobApproximate || p.dobApproximate || p.dob?.toDate().toISOString().slice(0, 10) === d.dob)
    })
    if (dup) return Response.json({ patient: { id: dup.id, ...dup.data(), dob: dup.data().dob?.toDate() } })

    const now = new Date()
    const data = {
      phone: d.phone, name: d.name.trim(), dob: new Date(`${d.dob}T00:00:00Z`),
      ...(d.dobApproximate ? { dobApproximate: true } : {}), ...(d.gender ? { gender: d.gender } : {}),
      medicalHistory: d.medicalHistory || null, email: d.email || null,
      createdAt: now, updatedAt: now, createdBy: `staff:${session.uid}`,
    }
    const ref = db.col('patients').doc()
    await ref.set(data)
    await audit(tenant, session, 'patient.create', `patients/${ref.id}`)
    return Response.json({ patient: { id: ref.id, ...data } }, { status: 201 })
  } catch (error) {
    console.error('[patient-create]', error)
    return apiError('SERVER_ERROR')
  }
}

// PUT — edit a patient's record (clinic users only).
export async function PUT(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'patients:manage')
    if (denied) return denied

    const parsed = await parseBody(request, patientDetailsSchema.partial().extend({ id: patientDetailsSchema.shape.name.min(1) }))
    if ('error' in parsed) return parsed.error
    const { id, name, phone, dob, dobApproximate, medicalHistory, email, gender } = parsed.data

    const db = tenantDb(tenant)
    const ref = db.col('patients').doc(id)
    const current = await ref.get()
    if (!current.exists) return Response.json({ error: 'Patient not found' }, { status: 404 })

    // Two records for the same person on the same number is what the import and the booking forms avoid; editing must not create one.
    const newName = (name ?? current.data()!.name ?? '').trim().toLowerCase()
    const newPhone = phone ?? current.data()!.phone
    if (name !== undefined || phone !== undefined) {
      const same = (await db.col('patients').where('phone', '==', newPhone).get()).docs
        .find(d => d.id !== id && String(d.data().name ?? '').trim().toLowerCase() === newName)
      if (same) return Response.json({ error: 'Another patient with this name and number already exists' }, { status: 409 })
    }

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (name) update.name = name.trim()
    if (phone) update.phone = phone
    if (dob) {
      update.dob = new Date(`${dob}T00:00:00Z`)
      update.dobApproximate = dobApproximate === true
    }
    if (gender) update.gender = gender
    if (medicalHistory !== undefined) update.medicalHistory = medicalHistory || null
    if (email !== undefined) update.email = email || null
    await ref.update(update)
    await audit(tenant, session, 'patient.update', `patients/${id}`)

    const p = (await ref.get()).data() as any
    return Response.json({ patient: { id, ...p, dob: p.dob?.toDate() } })
  } catch (error) {
    console.error('[patient-update]', error)
    return apiError('SERVER_ERROR')
  }
}

// DELETE — remove a patient together with every visit, prescription and payment of theirs (and any scanned
// prescription pages). The screen warns before this is sent; it cannot be undone.
export async function DELETE(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'patients:manage')
    if (denied) return denied

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return Response.json({ error: 'Patient not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const ref = db.col('patients').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return Response.json({ error: 'Patient not found' }, { status: 404 })

    const visits = (await db.col('appointments').where('patientId', '==', id).get()).docs
    const rxs = (await db.col('prescriptions').where('patientId', '==', id).get()).docs
    const pays = new Map<string, any>()
    for (const d of (await db.col('payments').where('patientId', '==', id).get()).docs) pays.set(d.id, d)
    for (const v of visits) for (const d of (await db.col('payments').where('appointmentId', '==', v.id).get()).docs) pays.set(d.id, d)
    const files = visits.flatMap(v => ((v.data().rxScans ?? []) as { path?: string }[]).map(x => x.path).filter((p): p is string => !!p))

    // Medical records may only be erased by the doctor or owner, not the front desk.
    if ((visits.length || rxs.length) && !can(session.role, 'prescriptions:manage')) {
      return Response.json({ error: 'Only the doctor or owner can delete a patient who has visits or prescriptions.' }, { status: 403 })
    }

    // Records first, files after: a leftover file is harmless, a leftover record would point at nothing.
    for (const d of [...visits, ...rxs, ...pays.values()]) await d.ref.delete()
    await Promise.all(files.map(p => deleteFile(p).catch(() => {})))
    await ref.delete()
    await audit(tenant, session, 'patient.delete', `patients/${id}`, { visits: visits.length, prescriptions: rxs.length, payments: pays.size })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[patient-delete]', error)
    return apiError('SERVER_ERROR')
  }
}
