import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { apiError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

// The clinic's saved logo or doctor photo from our own origin, so Settings can open it in the picture
// adjuster (a browser may not read a storage-domain picture into a canvas). Raster formats only; never script.
const KINDS = { logo: 'logoUrl', photo: 'photoUrl' } as const

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) return apiError('UNAUTHORIZED')
    const denied = forbid(session, 'settings:manage')
    if (denied) return denied
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')

    const kind = new URL(request.url).searchParams.get('kind') as keyof typeof KINDS | null
    if (!kind || !(kind in KINDS)) return new Response(null, { status: 400 })
    const doc = await tenantDb(tenant).profile().get()
    const url: string | undefined = doc.exists ? (doc.data() as any)[KINDS[kind]] : undefined
    if (!url) return new Response(null, { status: 404 })

    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }
    if (url.startsWith('data:')) {
      const [head, data] = url.split(',')
      const type = head.split(':')[1]?.split(';')[0] ?? ''
      if (!/^image\/(png|jpeg|webp)$/.test(type)) return new Response(null, { status: 415 })
      return new Response(Buffer.from(data, 'base64'), { headers: { ...headers, 'Content-Type': type } })
    }
    const res = await fetch(url)
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(png|jpeg|webp)/.test(type)) return new Response(null, { status: 404 })
    return new Response(Buffer.from(await res.arrayBuffer()), { headers: { ...headers, 'Content-Type': type } })
  } catch {
    return new Response(null, { status: 404 })
  }
}
