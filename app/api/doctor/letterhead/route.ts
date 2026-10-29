import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { downloadFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

// GET /api/doctor/letterhead — the clinic's uploaded letterhead, for the preview in Settings.
// It is private to the clinic's own signed-in staff; patients only ever see it inside a prescription.
export async function GET() {
  try {
    const tenant = await getTenant()
    if (!tenant) return new Response(null, { status: 404 })
    const session = await getSession()
    if (!session?.uid) return new Response(null, { status: 401 })
    if (forbid(session, 'settings:manage')) return new Response(null, { status: 403 })

    const path = (await tenantDb(tenant).profile().get()).data()?.letterheadPath as string | undefined
    const data = path ? await downloadFile(path) : null
    if (!path || !data) return new Response(null, { status: 404 })

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': path.endsWith('.png') ? 'image/png' : 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[letterhead-get]', error)
    return new Response(null, { status: 500 })
  }
}
