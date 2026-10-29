import { featureGate } from '@/lib/tenant/features'
import { getTenant } from '@/lib/tenant/resolve'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { renderReceiptPdf } from '@/lib/modules/documents'
import { pdfResponse } from '@/lib/pdfHttp'
import { apiError } from '@/lib/errors'

export const runtime = 'nodejs'

// GET /api/payments/[id]/pdf — the receipt as a PDF, built on the server from what
// is saved. `?inline=1` opens it in the browser's viewer instead of downloading.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const gated = featureGate(tenant, 'payments')
    if (gated) return gated
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'payments:manage')
    if (denied) return denied

    const { id } = await params
    const pdf = await renderReceiptPdf(tenant, id)
    if (!pdf) return Response.json({ error: 'Payment not found' }, { status: 404 })

    const inline = new URL(request.url).searchParams.get('inline') === '1'
    await audit(tenant, session, inline ? 'payment.print' : 'payment.download', `payments/${id}`)
    return pdfResponse(pdf.buffer, pdf.filename, inline)
  } catch (error) {
    console.error('[payment-pdf-get]', error)
    return Response.json({ error: 'Could not create the PDF' }, { status: 500 })
  }
}
