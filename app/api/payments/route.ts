import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { uploadFile } from '@/lib/storage'
import { sendEmail } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'

// POST — log a payment
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appointmentId, patientId, amount, mode, paidAt, notes } = await request.json()

    if (!appointmentId || !patientId || !amount || !mode) {
      return Response.json({ error: 'appointmentId, patientId, amount and mode are required' }, { status: 400 })
    }

    const payment = await prisma.payment.upsert({
      where: { appointmentId },
      update: { amount, mode, paidAt: paidAt ? new Date(paidAt) : new Date(), notes },
      create: {
        appointmentId,
        patientId,
        amount,
        mode,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        notes,
      },
    })

    return Response.json({ payment }, { status: 201 })
  } catch (error) {
    console.error('[payment-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — upload receipt PDF
export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const pdfFile = formData.get('pdf') as File | null
    const paymentId = formData.get('paymentId') as string | null

    if (!pdfFile || !paymentId) {
      return Response.json({ error: 'pdf and paymentId are required' }, { status: 400 })
    }

    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    const receiptPdfPath = await uploadFile(buffer, `receipts/${paymentId}.pdf`, 'application/pdf')

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { receiptPdfPath },
    })

    return Response.json({ payment })
  } catch (error) {
    console.error('[payment-pdf-put]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
