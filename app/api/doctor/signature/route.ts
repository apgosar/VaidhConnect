import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { downloadFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

// GET /api/doctor/signature — the doctor's uploaded signature, for the preview in Settings.
// Private to the clinic's own signed-in owner/doctor; patients only ever see it inside a prescription.
export async function GET() {
  try {
    const tenant = await getTenant()
    if (!tenant) return new Response(null, { status: 404 })
    const session = await getSession()
    if (!session?.uid) return new Response(null, { status: 401 })
    if (forbid(session, 'settings:manage')) return new Response(null, { status: 403 })

    const path = (await tenantDb(tenant).profile().get()).data()?.signaturePath as string | undefined
    const data = path ? await downloadFile(path) : null
    if (!path || !data) return new Response(null, { status: 404 })

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[signature-get]', error)
    return new Response(null, { status: 500 })
  }
}
