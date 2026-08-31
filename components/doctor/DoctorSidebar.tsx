'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Calendar, Users, Settings, LogOut,
  Menu, X, CalendarOff, MessageSquare
} from 'lucide-react'

interface DoctorSidebarProps {
  doctorName: string
  clinicName: string
  specialty: string
  themeColor: string
}

const navItems = [
  { href: '/doctor/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/doctor/calendar', icon: Calendar, label: 'Calendar' },
  { href: '/doctor/patients', icon: Users, label: 'Patients' },
  { href: '/doctor/whatsapp-logs', icon: MessageSquare, label: 'WhatsApp Logs' },
  { href: '/doctor/settings', icon: Settings, label: 'Settings' },
]

// Subtle botanical leaf watermark for sidebar lower half
function SidebarBotanical() {
  return (
    <svg
      className="botanical-watermark"
      style={{ bottom: '60px', left: '10px', width: '220px', height: '200px', opacity: 0.05 }}
      viewBox="0 0 220 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M90 190 C85 160 80 130 90 100 C100 70 95 35 90 5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M88 30 C70 20 45 28 38 45 C35 52 42 58 52 52 C68 43 80 38 88 30Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M92 50 C110 37 135 43 142 60 C145 67 138 74 128 68 C112 58 100 53 92 50Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M86 80 C65 68 38 76 30 95 C27 104 35 111 47 104 C68 92 80 87 86 80Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M94 95 C115 80 144 88 152 110 C155 120 147 127 135 119 C116 107 102 102 94 95Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M85 135 C62 122 32 132 23 153 C20 164 29 172 42 164 C63 150 76 144 85 135Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M95 148 C118 133 150 143 159 167 C162 178 153 186 140 177 C119 163 104 156 95 148Z" stroke="white" strokeWidth="1" fill="none"/>
      <circle cx="90" cy="5" r="3" stroke="white" strokeWidth="1" fill="none"/>
      <circle cx="86" cy="13" r="2" stroke="white" strokeWidth="0.8" fill="none"/>
      <circle cx="94" cy="13" r="2" stroke="white" strokeWidth="0.8" fill="none"/>
      {/* Second stem — offset for depth */}
      <path d="M155 190 C152 162 148 138 155 112 C162 86 158 55 155 30" stroke="white" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="3 3"/>
      <path d="M153 55 C138 45 120 52 114 66 C112 73 118 78 126 73 C138 65 148 60 153 55Z" stroke="white" strokeWidth="0.8" fill="none"/>
      <path d="M157 90 C172 78 192 85 196 100 C198 107 192 113 184 108 C172 100 163 96 157 90Z" stroke="white" strokeWidth="0.8" fill="none"/>
    </svg>
  )
}

export default function DoctorSidebar({ doctorName, clinicName }: DoctorSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const router = useRouter()

  const handleSignOut = async () => {
    try {
      const { auth } = await import('@/lib/firebase/client')
      await auth.signOut()
      await fetch('/api/auth/session', { method: 'DELETE' })
      router.push('/doctor/login')
      router.refresh()
    } catch (e) {
      console.error(e)
    }
  }

  const NavContent = () => (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Brand / Clinic Header */}
      <div
        className="p-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-3">
          {/* Leaf emblem mark */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'rgba(201,161,93,0.15)', border: '1px solid rgba(201,161,93,0.25)' }}
          >
            🌿
          </div>
          <div className="min-w-0">
            <p
              className="font-bold text-white text-sm truncate leading-snug"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {clinicName}
            </p>
            <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.50)' }}>
              Dr. {doctorName}
            </p>
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'nav-active-indicator'
                  : ''
              }`}
              style={{
                color: isActive ? 'var(--color-gold)' : 'rgba(255,255,255,0.65)',
                background: isActive ? 'rgba(201,161,93,0.08)' : 'transparent',
                paddingLeft: isActive ? '20px' : '12px',
              }}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign Out */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-colors"
          style={{ color: 'rgba(255,255,255,0.45)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.80)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>

      {/* Botanical watermark in lower sidebar */}
      <SidebarBotanical />
    </div>
  )


  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex w-64 h-screen sticky top-0 flex-col flex-shrink-0 z-40"
        style={{ background: 'var(--color-forest)' }}
      >
        <NavContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-3 right-4 z-50 p-2 rounded-lg shadow-md"
        style={{
          background: 'var(--color-forest)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'white',
        }}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(15,61,46,0.60)', backdropFilter: 'blur(2px)' }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="lg:hidden fixed left-0 top-0 bottom-0 w-72 z-50 flex flex-col"
            style={{ background: 'var(--color-forest)' }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg"
              style={{ color: 'rgba(255,255,255,0.60)' }}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            <NavContent />
          </aside>
        </>
      )}
    </>
  )
}
