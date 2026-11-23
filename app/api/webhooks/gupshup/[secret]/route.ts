import { timingSafeEqual } from 'node:crypto'
import { adminDb } from '@/lib/firebase/server'
import { tenantDb } from '@/lib/db/tenant'
import { gupshupErrorMessage } from '@/lib/whatsappTemplates'

// Gupshup delivery updates (message-event). Gupshup does not sign these, so the URL itself carries a
// secret (GUPSHUP_WEBHOOK_SECRET). It must answer 2xx within 10 seconds, so unknown events are simply accepted.

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 }

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const expected = process.env.GUPSHUP_WEBHOOK_SECRET
  const { secret } = await params
  if (!expected || !same(secret, expected)) return new Response('Not found', { status: 404 })

  try {
    const body = await request.json().catch(() => null)
    if (body?.type !== 'message-event') return new Response('ok')
    const event = body.payload ?? {}
    const type = String(event.type ?? '')
    if (type !== 'sent' && type !== 'delivered' && type !== 'read' && type !== 'failed') return new Response('ok')

    // The id we stored is the one Gupshup returned when sending (gsId); fall back to the WhatsApp id.
    let index: FirebaseFirestore.DocumentSnapshot | null = null
    for (const id of [event.gsId, event.id]) {
      if (typeof id !== 'string' || !id) continue
      const snap = await adminDb.collection('whatsapp_message_index').doc(id).get()
      if (snap.exists) { index = snap; break }
    }
    if (!index) return new Response('ok')
    const { clinicId, storage, logId } = index.data() as { clinicId: string; storage: 'legacy' | 'scoped'; logId: string }

    const ref = tenantDb({ clinicId, storage } as any).col('whatsapp_logs').doc(logId)
    const log = await ref.get()
    if (!log.exists) return new Response('ok')

    if (type === 'failed') {
      const inner = event.payload ?? {}
      await ref.update({
        status: 'failed',
        deliveryStatus: 'failed',
        errorDetail: gupshupErrorMessage(inner.code, String(inner.reason ?? 'WhatsApp could not deliver the message')),
      })
    } else {
      const current = String(log.data()?.deliveryStatus ?? '')
      // Updates can arrive out of order; never step backwards (read -> delivered).
      if ((RANK[type] ?? 0) > (RANK[current] ?? 0)) await ref.update({ deliveryStatus: type })
    }
  } catch (err) {
    console.error('[gupshup-webhook]', err)
  }
  return new Response('ok')
}
