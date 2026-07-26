import { redirect } from 'next/navigation'
import { auth } from '@/auth'
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
  const session = await auth()
  if (!session?.user) {
    redirect('/doctor/login')
  }

  const user = session.user as Record<string, unknown>

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* Sidebar */}
      <DoctorSidebar
        doctorName={session.user.name ?? ''}
        clinicName={user.clinicName as string ?? ''}
        specialty={user.specialty as string ?? ''}
        themeColor={user.themeColor as string ?? '#0F3D2E'}
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
              {user.clinicName as string}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Dr. {session.user.name}
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
