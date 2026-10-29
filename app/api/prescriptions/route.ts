import { z } from 'zod'
import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { parseBody } from '@/lib/validation'
import { audit } from '@/lib/audit'
import { uploadFile, tenantPath } from '@/lib/storage'

const text = (max: number) => z.string().trim().max(max)
const prescriptionSchema = z.object({
  appointmentId: z.string().min(1).max(128),
  patientId: z.string().min(1).max(128),
  diagnosis: text(2000).optional().nullable(),
  medicines: z.array(z.object({
    name: text(200),
    dosage: text(100).optional().default(''),
    frequency: text(100).optional().default(''),
    duration: text(100).optional().default(''),
    instructions: text(500).optional(),
  })).max(50).default([]),
  notes: text(2000).optional().nullable(),
})

async function authorize() {
  const tenant = await getTenant()
  if (!tenant) return { error: Response.json({ error: 'Clinic not found' }, { status: 404 }) }
  const gated = featureGate(tenant, 'prescriptions')
  if (gated) return { error: gated }
  const session = await getSession()
  if (!session?.uid) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = forbid(session, 'prescriptions:manage')
  if (denied) return { error: denied }
  return { tenant, session, db: tenantDb(tenant) }
}

// POST — save/update the prescription for an appointment
export async function POST(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session, db } = a

    const parsed = await parseBody(request, prescriptionSchema)
    if ('error' in parsed) return parsed.error
    const { appointmentId, patientId, diagnosis, medicines, notes } = parsed.data

    const appt = await db.col('appointments').doc(appointmentId).get()
    if (!appt.exists || appt.data()?.patientId !== patientId) {
      return Response.json({ error: 'Appointment and patient do not match' }, { status: 400 })
    }

    const existing = await db.col('prescriptions').where('appointmentId', '==', appointmentId).limit(1).get()
    const now = new Date()
    const data = { appointmentId, patientId, diagnosis: diagnosis ?? null, medicines, notes: notes ?? null, updatedAt: now }

    let id: string
    if (existing.empty) {
      const ref = db.col('prescriptions').doc()
      await ref.set({ ...data, createdAt: now })
      id = ref.id
    } else {
      await existing.docs[0].ref.update(data)
      id = existing.docs[0].id
    }

    await audit(tenant, session, 'prescription.save', `prescriptions/${id}`)
    return Response.json({ prescription: { id, ...data } }, { status: 201 })
  } catch (error) {
    console.error('[prescription-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — attach the generated PDF
export async function PUT(request: Request) {
  try {
    const a = await authorize()
    if ('error' in a) return a.error
    const { tenant, session, db } = a

    const formData = await request.formData()
    const pdfFile = formData.get('pdf')
    const prescriptionId = formData.get('prescriptionId')
    if (!(pdfFile instanceof File) || typeof prescriptionId !== 'string' || !prescriptionId) {
      return Response.json({ error: 'pdf and prescriptionId are required' }, { status: 400 })
    }
    if (pdfFile.type !== 'application/pdf' || pdfFile.size > 5 * 1024 * 1024) {
      return Response.json({ error: 'Prescription must be a PDF under 5MB' }, { status: 400 })
    }

    const rxRef = db.col('prescriptions').doc(prescriptionId)
    if (!(await rxRef.get()).exists) return Response.json({ error: 'Prescription not found' }, { status: 404 })

    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    const pdfPath = await uploadFile(buffer, tenantPath(tenant, `prescriptions/${prescriptionId}.pdf`), 'application/pdf')
    await rxRef.update({ pdfPath, updatedAt: new Date() })
    await audit(tenant, session, 'prescription.pdf', `prescriptions/${prescriptionId}`)

    const updated = await rxRef.get()
    return Response.json({ prescription: { id: updated.id, ...updated.data() } })
  } catch (error) {
    console.error('[prescription-pdf-put]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
