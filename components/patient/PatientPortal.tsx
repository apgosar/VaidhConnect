'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Phone, MapPin, ExternalLink, Clock, ChevronRight, UserPlus, Calendar, User, MessageCircle, PlaySquare, CreditCard, Package } from 'lucide-react'
import { SPECIALTIES, DAYS_OF_WEEK } from '@/lib/constants'
import type { WeeklyTimings } from '@/lib/constants'
import { computeAge } from '@/lib/slots'

interface DoctorProfile {
  id: string
  name: string
  clinicName: string
  logoUrl?: string | null
  photoUrl?: string | null
  address?: string | null
  mapsUrl?: string | null
  phone?: string | null
  specialty: string
  practiceDescription: string | null
  themeColor: string
  qualifications?: string | null
  registrationNumber: string
  youtubeLinks: string[]
  products: { id: string; name: string; price: string; description: string; photoUrl?: string }[]
  pageViews: number
  timings: WeeklyTimings
  slotDurationMins: number
  paymentDetails?: string | null
  consultationFee?: string | null
  followUpFee?: string | null
}

interface PatientPortalProps {
  doctor: DoctorProfile
}

interface PatientRecord {
  id: string
  name: string
  phone: string
  dob: string
  medicalHistory?: string
  email?: string
  appointments: { id: string; startTime: string; chiefComplaint?: string }[]
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
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const phone = countryCode + phoneNumber
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundPatients, setFoundPatients] = useState<PatientRecord[] | null>(null)
  const router = useRouter()

  const specialtyData = SPECIALTIES.find(s => s.value === doctor.specialty)

  const downloadVCard = () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:;Dr. ${doctor.name};;;
FN:Dr. ${doctor.name}
ORG:${doctor.clinicName}
TITLE:${doctor.specialty}
TEL;TYPE=WORK,VOICE:${doctor.phone ?? ''}
URL:${doctor.mapsUrl ?? ''}
NOTE:Registration: ${doctor.registrationNumber}
END:VCARD`
    const blob = new Blob([vcf], { type: 'text/vcard' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Dr_${doctor.name.replace(/\s+/g, '_')}.vcf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      if (data.found) {
        // Show the patient selection screen
        setFoundPatients(data.patients)
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

  const handleBookForPatient = (patient: PatientRecord) => {
    sessionStorage.setItem('patient', JSON.stringify(patient))
    if (patient.appointments.length > 0) {
      sessionStorage.setItem('chiefComplaint', '')
    }
    router.push('/book')
  }

  const handleManageForPatient = (patient: PatientRecord) => {
    sessionStorage.setItem('patient', JSON.stringify(patient))
    router.push('/appointments')
  }

  const handleAddFamilyMember = () => {
    const normalized = phone.replace(/[\s\-()]/g, '')
    sessionStorage.setItem('phone', normalized)
    router.push('/register')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* ── Hero Header ─────────────────────────────────────── */}
      <div
        id="about"
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(160deg, var(--color-forest) 0%, var(--color-pine) 100%)`,
          paddingBottom: '48px',
        }}
      >
        <BotanicalWatermark />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse at 30% 60%, rgba(201,161,93,0.08) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />

        {/* Page Views Badge */}
        <div className="absolute top-4 right-4 bg-black/20 backdrop-blur-md rounded-full px-3 py-1 text-xs text-white/90 border border-white/10 flex items-center gap-1.5 z-10">
          <User size={12} />
          {doctor.pageViews} views
        </div>

        <div className="relative page-container-sm pt-12 pb-6 text-white">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Dr Photo (Primary) and Clinic Logo (Secondary) */}
            <div className="relative">
              {doctor.photoUrl ? (
                <div className="w-24 h-24 rounded-full overflow-hidden shadow-xl border-2 border-white/20">
                  <Image src={doctor.photoUrl} alt={`Dr. ${doctor.name}`} width={96} height={96} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center text-4xl shadow-xl">
                  {specialtyData?.icon ?? '👨‍⚕️'}
                </div>
              )}
              {doctor.logoUrl && (
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-lg overflow-hidden bg-white shadow-lg border border-slate-100 p-0.5">
                  <Image src={doctor.logoUrl} alt="Clinic Logo" width={40} height={40} className="w-full h-full object-contain" />
                </div>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'white' }}>
                Dr. {doctor.name}
              </h1>
              <p className="mt-1.5 text-base font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {doctor.clinicName}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.70)' }}>
                {doctor.qualifications && <span>{doctor.qualifications} · </span>}
                Reg: {doctor.registrationNumber}
              </p>

              {doctor.practiceDescription && (
                <p className="mt-1.5 text-base font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {doctor.practiceDescription}
                </p>
              )}

              {(doctor.consultationFee || doctor.followUpFee) && (
                <div className="mt-4 inline-flex justify-center gap-6 text-sm bg-black/10 rounded-2xl px-6 py-2.5 border border-white/10 backdrop-blur-sm">
                  {doctor.consultationFee && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.6)' }}>Consultation</span>
                      <span className="font-semibold text-white tracking-wide">{doctor.consultationFee}</span>
                    </div>
                  )}
                  {doctor.consultationFee && doctor.followUpFee && (
                    <div className="w-px bg-white/20 self-stretch my-1"></div>
                  )}
                  {doctor.followUpFee && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.6)' }}>Follow-up</span>
                      <span className="font-semibold text-white tracking-wide">{doctor.followUpFee}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col items-center mt-6">
                <div className="flex flex-wrap justify-center gap-3">
                  <button onClick={downloadVCard} className="flex flex-col items-center gap-1.5 hover:scale-105 transition-transform group" aria-label="Save Contact">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', backdropFilter: 'blur(4px)' }}>
                      <UserPlus size={20} />
                    </div>
                    <span className="text-[10px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>Save</span>
                  </button>

                  {doctor.phone && (
                    <>
                      <a href={`tel:${doctor.phone.replace(/\D/g, '')}`} className="flex flex-col items-center gap-1.5 hover:scale-105 transition-transform group" aria-label="Call">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', backdropFilter: 'blur(4px)' }}>
                          <Phone size={20} />
                        </div>
                        <span className="text-[10px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>Call</span>
                      </a>
                      
                      <a href={`https://wa.me/${doctor.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 hover:scale-105 transition-transform group" aria-label="WhatsApp">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', backdropFilter: 'blur(4px)' }}>
                          <MessageCircle size={20} />
                        </div>
                        <span className="text-[10px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>WhatsApp</span>
                      </a>
                    </>
                  )}

                  {doctor.mapsUrl && (
                    <a href={doctor.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 hover:scale-105 transition-transform group" aria-label="Navigate">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', backdropFilter: 'blur(4px)' }}>
                        <MapPin size={20} />
                      </div>
                      <span className="text-[10px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>Navigate</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Cards ────────────────────────────────────── */}
      <div className="page-container-sm space-y-4 pb-32" style={{ marginTop: '-24px' }}>

        {/* ── STEP 2: Patient Selection (shown after phone lookup) ── */}
        {foundPatients ? (
          <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>
                  Welcome back!
                </h2>
                <button
                  onClick={() => setFoundPatients(null)}
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-sage)' }}
                >
                  ← Change number
                </button>
              </div>
              <p className="text-sm" style={{ color: 'var(--color-sage)' }}>
                {foundPatients.length === 1
                  ? 'We found your profile. Choose what you would like to do.'
                  : `We found ${foundPatients.length} patients linked to this number. Select a patient below.`}
              </p>
            </div>

            {/* Patient cards */}
            {foundPatients.map(patient => {
              const age = (() => { try { return computeAge(patient.dob) } catch { return null } })()
              return (
                <div key={patient.id} className="card overflow-hidden animate-fade-in">
                  {/* Patient info header */}
                  <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-sage-border)' }}>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                      style={{ background: 'var(--color-forest)' }}
                    >
                      <User size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--color-charcoal)' }}>{patient.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-sage)' }}>
                        {age !== null ? `Age ${age}` : ''}
                        {patient.medicalHistory ? ` · ${patient.medicalHistory.slice(0, 40)}${patient.medicalHistory.length > 40 ? '…' : ''}` : ''}
                      </p>
                    </div>
                    {patient.appointments.length > 0 && (
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)' }}
                      >
                        {patient.appointments.length} upcoming
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-0" style={{ borderTop: 'none' }}>
                    <button
                      onClick={() => handleManageForPatient(patient)}
                      className="flex-1 flex flex-col items-center gap-1 py-4 text-sm font-medium transition-colors hover:bg-[var(--color-primary-bg)]"
                      style={{ color: 'var(--color-charcoal-mid)', borderRight: '1px solid var(--color-sage-border)' }}
                    >
                      <Calendar size={18} style={{ color: 'var(--color-forest)' }} />
                      <span>My Appointments</span>
                    </button>
                    <button
                      onClick={() => handleBookForPatient(patient)}
                      className="flex-1 flex flex-col items-center gap-1 py-4 text-sm font-semibold transition-colors hover:bg-[var(--color-primary-bg)]"
                      style={{ color: 'var(--color-forest)' }}
                    >
                      <ChevronRight size={18} />
                      <span>Book Appointment</span>
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Add Family Member */}
            <button
              onClick={handleAddFamilyMember}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-sm transition-all"
              style={{
                border: '1.5px dashed var(--color-sage-border)',
                color: 'var(--color-sage)',
                background: 'transparent',
              }}
            >
              <UserPlus size={16} />
              Add a new patient for this number
            </button>
          </div>
        ) : (

        /* ── STEP 1: Phone Entry ── */
        <div id="book" className="card p-6 animate-fade-in scroll-mt-20 relative z-10 mt-2">
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
              <div className="flex gap-2">
                {/* Editable country code */}
                <div className="relative">
                  <input
                    type="text"
                    className="form-input text-center font-medium"
                    style={{ width: '72px' }}
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    aria-label="Country code"
                    maxLength={5}
                  />
                </div>
                {/* Phone number */}
                <div className="relative flex-1">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                  <input
                    id="phone-input"
                    type="tel"
                    className="form-input pl-9 w-full"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    required
                    autoComplete="tel"
                    inputMode="numeric"
                  />
                </div>
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
        )}

        {/* Clinic Info */}
        {(doctor.address || doctor.phone) && (
          <div id="location" className="card p-6 space-y-4 animate-fade-in scroll-mt-20">
            <h3
              className="font-semibold flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              <MapPin size={16} style={{ color: 'var(--color-sage)' }} />
              Clinic Information
            </h3>

            

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

        {/* ── Products & Services ── */}
        {doctor.products && doctor.products.length > 0 && (
          <div id="products" className="space-y-3 relative z-10 pt-2">
            <h2 className="text-xl font-bold px-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Products & Services</h2>
            <div className="grid grid-cols-2 gap-3">
              {doctor.products.map(prod => (
                <div key={prod.id} className="card p-3 flex flex-col gap-2 shadow-sm animate-fade-in" style={{ border: '1px solid var(--color-sage-border)' }}>
                  {prod.photoUrl ? (
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-50 mb-1">
                      <Image src={prod.photoUrl} alt={prod.name} width={150} height={150} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full aspect-square rounded-lg bg-slate-50 mb-1 flex items-center justify-center border border-slate-100">
                      <span className="text-4xl">💊</span>
                    </div>
                  )}
                  <h3 className="font-semibold text-sm leading-tight text-slate-800">{prod.name}</h3>
                  {prod.description && <p className="text-xs text-slate-500 line-clamp-2">{prod.description}</p>}
                  <p className="font-bold text-sm text-forest mt-auto">{prod.price}</p>
                  <a 
                    href={`https://wa.me/${doctor.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I am interested in ${prod.name}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm w-full mt-1 border-forest text-forest hover:bg-primary-bg"
                  >
                    Enquire
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payment Details ── */}
        {doctor.paymentDetails && (typeof doctor.paymentDetails === 'string' ? doctor.paymentDetails.trim() !== '' : Object.keys(doctor.paymentDetails).length > 0) && (
          <div id="payment" className="card p-5 space-y-4 animate-fade-in scroll-mt-20">
            <h3
              className="font-semibold flex items-center gap-2 mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              <CreditCard size={18} style={{ color: 'var(--color-sage)' }} />
              Payment Details
            </h3>
            {(() => {
              let parsedPayment: any = null;
              if (typeof doctor.paymentDetails === 'object' && doctor.paymentDetails !== null) {
                parsedPayment = doctor.paymentDetails;
              } else if (typeof doctor.paymentDetails === 'string' && doctor.paymentDetails.trim() !== '') {
                try {
                  parsedPayment = JSON.parse(doctor.paymentDetails);
                } catch {
                  // Not valid JSON, treat as raw text
                }
              }

              const isObj = parsedPayment !== null && typeof parsedPayment === 'object';
              const pay = isObj ? parsedPayment : null;
              const rawStr = !isObj ? (typeof doctor.paymentDetails === 'string' ? doctor.paymentDetails : '') : '';

              if (isObj && (pay.upiId || pay.bankDetails || pay.qrCodeUrl)) {
                return (
                  <div className="space-y-4">
                    {pay.qrCodeUrl && (
                      <div className="flex justify-center mb-4">
                        <img src={pay.qrCodeUrl} alt="UPI QR Code" className="w-48 h-48 rounded-lg shadow-sm border border-slate-200 object-contain bg-white p-2" />
                      </div>
                    )}
                    {pay.upiId && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">UPI ID</p>
                        <p className="font-medium text-slate-800 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 text-sm tracking-wide break-all">{pay.upiId}</p>
                      </div>
                    )}
                    {pay.bankDetails && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Bank Transfer</p>
                        <div className="bg-slate-50 px-3 py-3 rounded-lg border border-slate-100">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-slate-700">{pay.bankDetails.replace(/\\n/g, '\n')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <div className="text-sm whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100" style={{ color: 'var(--color-charcoal-mid)' }}>
                  {rawStr.replace(/\\n/g, '\n')}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── YouTube Videos ── */}
        {doctor.youtubeLinks && doctor.youtubeLinks.length > 0 && doctor.youtubeLinks.some(link => link.trim() !== '') && (
          <div className="space-y-3 relative z-10" id="videos">
            <h2 className="text-xl font-bold px-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Featured Videos</h2>
            <div className="flex flex-col gap-4 pb-2">
              {doctor.youtubeLinks.filter(l => l.trim() !== '').map((link, idx) => {
                // Extract video ID for embed
                let videoId = ''
                try {
                  const url = new URL(link)
                  videoId = url.searchParams.get('v') || url.pathname.split('/').pop() || ''
                } catch { /* ignore */ }
                
                if (!videoId) return null
                return (
                  <div key={idx} className="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
                    <iframe
                      width="100%"
                      height="100%"
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="text-center text-xs pb-24" style={{ color: 'var(--color-sage)' }}>
          Each appointment is {doctor.slotDurationMins} minutes
        </p>
      </div>

      {/* ── Sticky Bottom Navigation ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 z-50 pb-safe">
        <div className="max-w-md mx-auto grid grid-cols-5 items-center px-2 py-3">
          
          {/* 1. About */}
          <div className="flex justify-center">
            <button onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 text-slate-500 hover:text-forest transition-colors">
              <User size={20} />
              <span className="text-[10px] font-medium uppercase tracking-wider">About</span>
            </button>
          </div>
          
          {/* 2. Products */}
          <div className="flex justify-center">
            <button onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 text-slate-500 transition-colors" style={{ opacity: doctor.products?.length ? 1 : 0.5, pointerEvents: doctor.products?.length ? 'auto' : 'none' }}>
              <Package size={20} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Products</span>
            </button>
          </div>

          {/* 3. Book (Center) */}
          <div className="flex justify-center">
            <button onClick={() => document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 transition-colors -mt-4 relative z-10">
              <div className="text-white p-3 rounded-full shadow-lg border-4" style={{ background: 'var(--color-forest)', borderColor: 'var(--color-linen)' }}>
                <Calendar size={22} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-forest)' }}>Book</span>
            </button>
          </div>

          {/* 4. Videos */}
          <div className="flex justify-center">
            <button onClick={() => document.getElementById('videos')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 text-slate-500 hover:text-forest transition-colors" style={{ opacity: doctor.youtubeLinks?.length ? 1 : 0.5, pointerEvents: doctor.youtubeLinks?.length ? 'auto' : 'none' }}>
              <PlaySquare size={20} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Videos</span>
            </button>
          </div>

          {/* 5. Payment */}
          <div className="flex justify-center">
            <button onClick={() => document.getElementById('payment')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 text-slate-500 hover:text-forest transition-colors" style={{ opacity: (doctor.paymentDetails && (typeof doctor.paymentDetails === 'string' ? doctor.paymentDetails.trim() !== '' : Object.keys(doctor.paymentDetails).length > 0)) ? 1 : 0.5, pointerEvents: (doctor.paymentDetails && (typeof doctor.paymentDetails === 'string' ? doctor.paymentDetails.trim() !== '' : Object.keys(doctor.paymentDetails).length > 0)) ? 'auto' : 'none' }}>
              <CreditCard size={20} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Payment</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
