import type { Metadata } from 'next'

// Pages under /doctor point at the doctor app's own manifest, so "Install" / "Add to home screen" here installs
// the doctor dashboard instead of the patient landing page.
export const metadata: Metadata = {
  manifest: '/doctor/manifest.webmanifest',
}

export default function DoctorRootLayout({ children }: { children: React.ReactNode }) {
  return children
}
