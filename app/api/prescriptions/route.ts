import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { uploadFile } from '@/lib/storage'

// POST — save/update prescription + generate PDF
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appointmentId, patientId, diagnosis, medicines, notes } = await request.json()

    if (!appointmentId || !patientId) {
      return Response.json({ error: 'appointmentId and patientId are required' }, { status: 400 })
    }

    // Upsert prescription
    const rxSnap = await adminDb.collection('prescriptions')
      .where('appointmentId', '==', appointmentId)
      .limit(1)
      .get()

    let prescriptionData: any = {
      appointmentId,
      patientId,
      diagnosis,
      medicines: medicines ?? [],
      notes,
    }

    let prescriptionId = ''

    if (rxSnap.empty) {
      prescriptionData.createdAt = new Date()
      prescriptionData.updatedAt = new Date()
      const newRef = adminDb.collection('prescriptions').doc()
      await newRef.set(prescriptionData)
      prescriptionId = newRef.id
    } else {
      prescriptionData.updatedAt = new Date()
      const existingRef = rxSnap.docs[0].ref
      await existingRef.update(prescriptionData)
      prescriptionId = existingRef.id
    }

    return Response.json({ prescription: { id: prescriptionId, ...prescriptionData } }, { status: 201 })
  } catch (error) {
    console.error('[prescription-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — store PDF path after client generates it
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const pdfFile = formData.get('pdf') as File | null
    const prescriptionId = formData.get('prescriptionId') as string | null

    if (!pdfFile || !prescriptionId) {
      return Response.json({ error: 'pdf and prescriptionId are required' }, { status: 400 })
    }

    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    const pdfPath = await uploadFile(buffer, `prescriptions/${prescriptionId}.pdf`, 'application/pdf')

    const rxRef = adminDb.collection('prescriptions').doc(prescriptionId)
    await rxRef.update({ pdfPath, updatedAt: new Date() })

    const updated = await rxRef.get()
    return Response.json({ prescription: { id: updated.id, ...updated.data() } })
  } catch (error) {
    console.error('[prescription-pdf-put]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
