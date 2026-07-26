'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Phone, MapPin, ExternalLink, Clock, ChevronRight } from 'lucide-react'
import { SPECIALTIES, DAYS_OF_WEEK } from '@/lib/constants'
import type { WeeklyTimings } from '@/lib/constants'

interface DoctorProfile {
  id: string
  name: string
  clinicName: string
  logoUrl?: string | null
  address?: string | null
  mapsUrl?: string | null
  phone?: string | null
  specialty: string
  themeColor: string
  qualifications?: string | null
  timings: WeeklyTimings
  slotDurationMins: number
}

interface PatientPortalProps {
  doctor: DoctorProfile
}

function formatDayTiming(day: WeeklyTimings[keyof WeeklyTimings]): string {
  if (!day.open) return 'Closed'
  const parts = []
  if (day.morning?.start && day.morning?.end) parts.push(`${day.morning.start} – ${day.morning.end}`)
  if (day.evening?.start && day.evening?.end) parts.push(`${day.evening.start} – ${day.evening.end}`)
  return parts.join(', ') || 'Open'
}

// Botanical SVG watermark — fine line tulsi/neem leaves, scientific sketch style
function BotanicalWatermark() {
  return (
    <svg
      className="botanical-watermark"
      style={{ right: '-20px', top: '-10px', width: '260px', height: '260px', opacity: 0.07 }}
      viewBox="0 0 260 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Main stem */}
      <path d="M130 240 C125 200 120 160 130 120 C140 80 135 40 130 10" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Left leaves — upper */}
      <path d="M128 50 C110 40 85 48 78 65 C75 72 82 78 92 72 C108 63 120 58 128 50Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M128 50 C122 62 118 70 92 72" stroke="white" strokeWidth="0.7" strokeDasharray="2 2"/>
      {/* Right leaves — upper */}
      <path d="M132 65 C150 52 175 58 182 75 C185 82 178 89 168 83 C152 73 140 70 132 65Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M132 65 C138 78 143 85 168 83" stroke="white" strokeWidth="0.7" strokeDasharray="2 2"/>
      {/* Left leaves — mid */}
      <path d="M126 100 C105 88 78 96 70 115 C67 124 75 131 87 124 C105 114 118 108 126 100Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M126 100 C119 114 115 122 87 124" stroke="white" strokeWidth="0.7" strokeDasharray="2 2"/>
      {/* Right leaves — mid */}
      <path d="M134 115 C155 100 184 108 192 130 C195 140 187 147 175 139 C156 127 142 122 134 115Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M134 115 C141 130 147 138 175 139" stroke="white" strokeWidth="0.7" strokeDasharray="2 2"/>
      {/* Left leaves — lower */}
      <path d="M125 155 C102 142 72 152 63 173 C60 184 69 192 82 184 C103 172 116 165 125 155Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M125 155 C117 170 112 180 82 184" stroke="white" strokeWidth="0.7" strokeDasharray="2 2"/>
      {/* Right leaves — lower */}
      <path d="M135 168 C158 153 190 163 199 187 C202 198 193 206 180 197 C159 183 144 176 135 168Z" stroke="white" strokeWidth="1" fill="none"/>
      <path d="M135 168 C143 185 149 194 180 197" stroke="white" strokeWidth="0.7" strokeDasharray="2 2"/>
      {/* Small buds at top */}
      <circle cx="130" cy="10" r="3" stroke="white" strokeWidth="1" fill="none"/>
      <circle cx="126" cy="18" r="2" stroke="white" strokeWidth="0.8" fill="none"/>
      <circle cx="134" cy="18" r="2" stroke="white" strokeWidth="0.8" fill="none"/>
    </svg>
  )
}

export default function PatientPortal({ doctor }: PatientPortalProps) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const specialtyData = SPECIALTIES.find(s => s.value === doctor.specialty)

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = phone.replace(/[\s\-()]/g, '')
    if (normalized.length < 10) {
      setError('Please enter a valid phone number')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/patients/lookup?phone=${encodeURIComponent(normalized)}`)
      const data = await res.json()

      if (data.found) {
        sessionStorage.setItem('patient', JSON.stringify(data.patient))
        router.push('/book')
      } else {
        sessionStorage.setItem('phone', normalized)
        router.push('/register')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* ── Hero Header ─────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(160deg, var(--color-forest) 0%, var(--color-pine) 100%)`,
          paddingBottom: '48px',
        }}
      >
        {/* Botanical watermark — one deliberate placement */}
        <BotanicalWatermark />

        {/* Subtle radial light for depth */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse at 30% 60%, rgba(201,161,93,0.08) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />

        <div className="relative page-container-sm pt-10 pb-4 text-white">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Logo / Brand mark */}
            {doctor.logoUrl ? (
              <div
                className="w-20 h-20 rounded-xl overflow-hidden shadow-lg flex-shrink-0"
                style={{ border: '1.5px solid rgba(255,255,255,0.20)' }}
              >
                <Image
                  src={doctor.logoUrl}
                  alt={`${doctor.clinicName} logo`}
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div
                className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl shadow-lg"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.15)' }}
              >
                {specialtyData?.icon ?? '🌿'}
              </div>
            )}

            <div>
              {/* Clinic name in display serif */}
              <h1
                className="text-3xl font-bold leading-tight"
                style={{ fontFamily: 'var(--font-display)', color: 'white' }}
              >
                {doctor.clinicName}
              </h1>
              <p className="mt-2 text-base" style={{ color: 'rgba(255,255,255,0.80)' }}>
                Dr. {doctor.name}
                {doctor.qualifications && (
                  <span style={{ color: 'rgba(255,255,255,0.60)' }}> · {doctor.qualifications}</span>
                )}
              </p>

              {/* Specialty pill — gold text on pine bg */}
              <div
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold"
                style={{
                  background: 'rgba(28,92,70,0.70)',
                  border: '1px solid rgba(201,161,93,0.40)',
                  color: 'var(--color-gold)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span>{specialtyData?.icon ?? '🩺'}</span>
                <span>{doctor.specialty}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Cards ────────────────────────────────────── */}
      <div className="page-container-sm space-y-4 pb-16" style={{ marginTop: '-24px' }}>
        {/* Booking Card */}
        <div className="card p-6 animate-fade-in">
          <h2
            className="text-xl font-bold mb-1"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
          >
            Book an Appointment
          </h2>
          <p className="text-sm mb-5" style={{ color: 'var(--color-sage)' }}>
            Enter your mobile number to get started
          </p>

          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="form-group">
              <label className="form-label" htmlFor="phone-input">Mobile Number</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }}>
                  <Phone size={16} />
                </div>
                <input
                  id="phone-input"
                  type="tel"
                  className="form-input pl-9"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  autoComplete="tel"
                  inputMode="tel"
                />
              </div>
              {error && <p className="form-error">{error}</p>}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
            >
              {loading ? (
                <><div className="spinner w-4 h-4" style={{ borderTopColor: 'var(--color-forest)' }} /><span>Checking...</span></>
              ) : (
                <><span>Continue</span><ChevronRight size={18} /></>
              )}
            </button>
          </form>
        </div>

        {/* Clinic Info */}
        {(doctor.address || doctor.phone) && (
          <div className="card p-6 space-y-4 animate-fade-in">
            <h3
              className="font-semibold flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              <MapPin size={16} style={{ color: 'var(--color-sage)' }} />
              Clinic Information
            </h3>

            {doctor.phone && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--color-sage)' }}>Phone</p>
                  <p className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{doctor.phone}</p>
                </div>
                <a
                  href={`tel:${doctor.phone}`}
                  className="btn btn-outline btn-sm"
                >
                  <Phone size={13} />
                  Call
                </a>
              </div>
            )}

            {doctor.address && doctor.phone && (
              <div className="divider" />
            )}

            {doctor.address && (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--color-sage)' }}>Address</p>
                  <p className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>{doctor.address}</p>
                </div>
                {doctor.mapsUrl && (
                  <a
                    href={doctor.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm shrink-0"
                  >
                    <ExternalLink size={13} />
                    Directions
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Clinic Timings */}
        {doctor.timings && Object.keys(doctor.timings).length > 0 && (
          <div className="card p-6 animate-fade-in">
            <h3
              className="font-semibold mb-4 flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              <Clock size={16} style={{ color: 'var(--color-sage)' }} />
              Clinic Hours
            </h3>
            <div className="space-y-2.5">
              {DAYS_OF_WEEK.map(day => {
                const dayData = (doctor.timings as WeeklyTimings)[day]
                if (!dayData) return null
                return (
                  <div key={day} className="flex justify-between items-center text-sm">
                    <span
                      className="capitalize font-medium w-28"
                      style={{ color: 'var(--color-charcoal)' }}
                    >
                      {day}
                    </span>
                    <span
                      className="font-tabular"
                      style={{ color: dayData.open ? 'var(--color-charcoal-mid)' : '#B54A3C' }}
                    >
                      {formatDayTiming(dayData)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs" style={{ color: 'var(--color-sage)' }}>
          Each appointment is {doctor.slotDurationMins} minutes
        </p>
      </div>
    </div>
  )
}
