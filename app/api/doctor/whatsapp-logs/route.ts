import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { constructMessageBody } from '@/lib/whatsapp'
import { type NextRequest } from 'next/server'

// GET /api/doctor/whatsapp-logs?limit=50&before=<ISO>
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '50'), 100)
    const before = request.nextUrl.searchParams.get('before')

    let query: any = adminDb
      .collection('whatsapp_logs')
      .orderBy('sentAt', 'desc')
      .limit(limit)

    if (before) {
      query = query.startAfter(new Date(before))
    }

    const snap = await query.get()

    const logs = snap.docs.map((doc: any) => {
      const data = doc.data()
      const params = data.params ?? []
      const messageBody = data.messageBody || constructMessageBody(data.templateName, params)

      return {
        id: doc.id,
        to: data.to,
        templateName: data.templateName,
        messageType: data.messageType ?? data.templateName,
        recipientName: data.recipientName ?? '',
        params,
        messageBody,
        status: data.status,
        errorDetail: data.errorDetail ?? null,
        sentAt: data.sentAt?.toDate?.()?.toISOString() ?? null,
      }
    })

    return Response.json({ logs })
  } catch (error) {
    console.error('[whatsapp-logs-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
