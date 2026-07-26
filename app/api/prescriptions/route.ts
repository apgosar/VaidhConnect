import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { uploadFile } from '@/lib/storage'

// POST — save/update prescription + generate PDF
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appointmentId, patientId, diagnosis, medicines, notes } = await request.json()

    if (!appointmentId || !patientId) {
      return Response.json({ error: 'appointmentId and patientId are required' }, { status: 400 })
    }

    // Upsert prescription
    const prescription = await prisma.prescription.upsert({
      where: { appointmentId },
      update: { diagnosis, medicines, notes },
      create: { appointmentId, patientId, diagnosis, medicines: medicines ?? [], notes },
    })

    return Response.json({ prescription }, { status: 201 })
  } catch (error) {
    console.error('[prescription-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — store PDF path after client generates it
export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
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

    const prescription = await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { pdfPath },
    })

    return Response.json({ prescription })
  } catch (error) {
    console.error('[prescription-pdf-put]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
