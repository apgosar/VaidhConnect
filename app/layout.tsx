import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Jivanand Clinic',
    template: '%s | Jivanand Clinic',
  },
  description: 'Book appointments at Jivanand Clinic — Dr. Abhay Shah, Ayurvedic Medicine',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico' },
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
