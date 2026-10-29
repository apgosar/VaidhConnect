import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { getSignedDownloadUrl } from '@/lib/storage'
import { NextResponse } from 'next/server'

// GET /api/payments/[id]/pdf — redirects to a short-lived signed URL.
// Receipts are private (financial data); only an authenticated doctor
// session can generate a link to view one.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await getTenant()
  if (!tenant) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
  const db = tenantDb(tenant)

  const { id } = await params
  const doc = await db.col('payments').doc(id).get()
  if (!doc.exists) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const receiptPdfPath = doc.data()?.receiptPdfPath as string | undefined
  if (!receiptPdfPath) {
    return NextResponse.json({ error: 'No receipt on file for this payment' }, { status: 404 })
  }

  try {
    const url = await getSignedDownloadUrl(receiptPdfPath)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('[payment-pdf-get]', error)
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
