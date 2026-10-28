import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
﻿import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { uploadFile } from '@/lib/storage'
import { sendEmail } from '@/lib/email'

// POST â€” log a payment
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const gated = await featureGate(db, 'payments')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appointmentId, patientId, amount, mode, paidAt, notes } = await request.json()

    if (!appointmentId || !patientId || !amount || !mode) {
      return Response.json({ error: 'appointmentId, patientId, amount and mode are required' }, { status: 400 })
    }

    const paySnap = await db.col('payments')
      .where('appointmentId', '==', appointmentId)
      .limit(1)
      .get()

    let paymentData: any = {
      appointmentId,
      patientId,
      amount: parseFloat(amount),
      mode,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      notes,
    }

    let paymentId = ''

    if (paySnap.empty) {
      paymentData.createdAt = new Date()
      paymentData.updatedAt = new Date()
      const newRef = db.col('payments').doc()
      await newRef.set(paymentData)
      paymentId = newRef.id
    } else {
      paymentData.updatedAt = new Date()
      const existingRef = paySnap.docs[0].ref
      await existingRef.update(paymentData)
      paymentId = existingRef.id
    }

    return Response.json({ payment: { id: paymentId, ...paymentData } }, { status: 201 })
  } catch (error) {
    console.error('[payment-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT â€” upload receipt PDF
export async function PUT(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const gated = await featureGate(db, 'payments')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) {
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

    const payRef = db.col('payments').doc(paymentId)
    await payRef.update({ receiptPdfPath, updatedAt: new Date() })

    const updated = await payRef.get()
    return Response.json({ payment: { id: updated.id, ...updated.data() } })
  } catch (error) {
    console.error('[payment-pdf-put]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
