import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { NextResponse } from 'next/server'

// Serves the clinic logo as a raw image — used for favicon and og:image
// Cache for 1 hour in CDN/browser, revalidate in background
export const revalidate = 3600

// This proxies a clinic-uploaded file from our own origin, so it must never be
// able to run script even if it is not a real image (e.g. a legacy SVG).
const INERT = {
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
}

export async function GET() {
  try {
    const tenant = await getTenant()
    const doctorDoc = tenant ? await tenantDb(tenant).profile().get() : null
    const doctor = doctorDoc?.exists ? doctorDoc.data() as any : null

    if (!doctor?.logoUrl) {
      // Redirect to static default favicon if no logo is set
      return new NextResponse(null, { status: 404 })
    }

    const logoUrl = doctor.logoUrl

    // If the logo is a base64 data URI (e.g. data:image/png;base64,...)
    if (logoUrl.startsWith('data:')) {
      const [header, base64Data] = logoUrl.split(',')
      const mimeType = header.split(':')[1].split(';')[0]
      const buffer = Buffer.from(base64Data, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        ...INERT,
          ...INERT,
        },
      })
    }

    // If the logo is an external URL (e.g. GCS), proxy it
    const imageRes = await fetch(logoUrl)
    if (!imageRes.ok) {
      return new NextResponse(null, { status: 404 })
    }
    const contentType = imageRes.headers.get('content-type') ?? 'image/png'
    const buffer = Buffer.from(await imageRes.arrayBuffer())

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        ...INERT,
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
