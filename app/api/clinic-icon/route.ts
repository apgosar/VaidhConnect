import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// Serves the clinic logo as a raw image — used for favicon and og:image
// Cache for 1 hour in CDN/browser, revalidate in background
export const revalidate = 3600

export async function GET() {
  try {
    const doctor = await prisma.doctor.findFirst({ select: { logoUrl: true } })

    if (!doctor?.logoUrl) {
      // Redirect to static default favicon if no logo is set
      return NextResponse.redirect(new URL('/favicon.ico', process.env.NEXTAUTH_URL ?? 'http://localhost:3001'))
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
        },
      })
    }

    // If the logo is an external URL (e.g. GCS), proxy it
    const imageRes = await fetch(logoUrl)
    if (!imageRes.ok) {
      return NextResponse.redirect(new URL('/favicon.ico', process.env.NEXTAUTH_URL ?? 'http://localhost:3001'))
    }
    const contentType = imageRes.headers.get('content-type') ?? 'image/png'
    const buffer = Buffer.from(await imageRes.arrayBuffer())

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return NextResponse.redirect(new URL('/favicon.ico', process.env.NEXTAUTH_URL ?? 'http://localhost:3001'))
  }
}
