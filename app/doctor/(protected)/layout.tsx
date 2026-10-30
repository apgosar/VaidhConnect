import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import DoctorSidebar from '@/components/doctor/DoctorSidebar'
import SiteFooter from '@/components/SiteFooter'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s | Doctor Dashboard' },
}

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) {
    redirect('/doctor/login')
  }

  const tenant = await getTenant()
  const doctorDoc = tenant ? await tenantDb(tenant).profile().get() : null
  const doctorProfile = doctorDoc?.exists ? doctorDoc.data() : null

  const rawDoctorName = doctorProfile?.name || session.name || 'Doctor'
  const doctorName = rawDoctorName.replace(/^Dr\.?\s*/i, '')
  const clinicName = doctorProfile?.clinicName || session.clinicName || 'Clinic'
  const specialty = doctorProfile?.specialty || session.specialty || 'General Physician'
  const themeColor = doctorProfile?.themeColor || session.themeColor || '#0F3D2E'
  const logoUrl = doctorProfile?.logoUrl ?? null

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* Sidebar */}
      <DoctorSidebar
        role={session.role}
        doctorName={doctorName}
        clinicName={clinicName}
        specialty={specialty}
        themeColor={themeColor}
        logoUrl={logoUrl}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div
          className="lg:hidden px-4 py-3 flex items-center justify-between flex-shrink-0"
          style={{
            background: 'var(--color-forest)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div>
            <p
              className="font-bold text-white text-sm leading-snug"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {clinicName}
            </p>
            <p className="text-xs" style={{ color: '#FFFFFF' }}>
              Dr. {doctorName}
            </p>
          </div>
          {/* hamburger is rendered inside DoctorSidebar */}
        </div>

        <main
          id="main-content"
          className="flex-1 p-4 md:p-6 lg:p-8"
          style={{ backgroundColor: 'var(--color-linen)' }}
        >
          {children}
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}
