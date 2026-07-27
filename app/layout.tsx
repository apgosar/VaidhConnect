import type { Metadata, Viewport } from 'next'
import './globals.css'

const APP_URL = process.env.NEXTAUTH_URL ?? 'https://vaidhconnect-893037849130.asia-south1.run.app'

export const metadata: Metadata = {
  title: {
    default: 'Jivanand Clinic',
    template: '%s | Jivanand Clinic',
  },
  description: 'Book appointments at Jivanand Clinic — Dr. Abhay Shah, Ayurvedic Medicine',
  manifest: '/manifest.json',
  icons: {
    icon: `${APP_URL}/api/clinic-icon`,
    apple: `${APP_URL}/api/clinic-icon`,
  },
  openGraph: {
    type: 'website',
    url: APP_URL,
    siteName: 'Jivanand Clinic',
    images: [{ url: `${APP_URL}/api/clinic-icon`, width: 512, height: 512 }],
  },
  twitter: {
    card: 'summary',
    images: [`${APP_URL}/api/clinic-icon`],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0F3D2E',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
        {children}
      </body>
    </html>
  )
}
