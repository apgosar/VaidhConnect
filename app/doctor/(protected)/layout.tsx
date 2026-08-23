import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import DoctorSidebar from '@/components/doctor/DoctorSidebar'
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

  const { adminDb } = await import('@/lib/firebase/server')
  const doctorDoc = await adminDb.collection('doctors').doc(session.uid).get()
  const doctorProfile = doctorDoc.exists ? doctorDoc.data() : null

  const rawDoctorName = doctorProfile?.name || session.name || 'Doctor'
  const doctorName = rawDoctorName.replace(/^Dr\.?\s*/i, '')
  const clinicName = doctorProfile?.clinicName || session.clinicName || 'Clinic'
  const specialty = doctorProfile?.specialty || session.specialty || 'General Physician'
  const themeColor = doctorProfile?.themeColor || session.themeColor || '#0F3D2E'

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* Sidebar */}
      <DoctorSidebar
        doctorName={doctorName}
        clinicName={clinicName}
        specialty={specialty}
        themeColor={themeColor}
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
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Dr. {doctorName}
            </p>
          </div>
          {/* hamburger is rendered inside DoctorSidebar */}
        </div>

        <main
          className="flex-1 p-4 md:p-6 lg:p-8"
          style={{ backgroundColor: 'var(--color-linen)' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
