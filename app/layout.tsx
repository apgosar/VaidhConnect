import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { getClinicProfile } from '@/lib/tenant/profile'
import { themeCss, themeColorOf } from '@/lib/tenant/theme'

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicProfile()
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const name: string = clinic?.data.clinicName ?? 'Clinic'
  const doctor: string | undefined = clinic?.data.name
  const description = `Book appointments at ${name}${doctor ? ` — Dr. ${String(doctor).replace(/^Dr\.?\s*/i, '')}` : ''}`

  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: { default: name, template: `%s | ${name}` },
    description,
    icons: { icon: '/api/clinic-icon', apple: '/api/clinic-icon' },
    openGraph: {
      type: 'website',
      siteName: name,
      images: [{ url: '/api/clinic-icon', width: 512, height: 512 }],
    },
    twitter: { card: 'summary', images: ['/api/clinic-icon'] },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const clinic = await getClinicProfile()
  return {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    themeColor: themeColorOf(clinic?.data.theme),
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const clinic = await getClinicProfile()
  const css = themeCss(clinic?.data.theme)

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      </head>
      <body className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
        {children}
      </body>
    </html>
  )
}
