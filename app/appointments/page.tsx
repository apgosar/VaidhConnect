'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Calendar, AlertTriangle, LogOut, Phone, FileText, Download } from 'lucide-react'
import { formatDateTimeInTz } from '@/lib/time'
import { getSavedPatients } from '@/lib/patientDevice'
import PinInput from '@/components/patient/PinInput'
import PinReset from '@/components/patient/PinReset'
import SiteFooter from '@/components/SiteFooter'

interface Appointment {
  id: string
  startTime: string
  endTime: string
  status: string
  chiefComplaint?: string | null
  patientName?: string | null
}

interface PastVisit { appointmentId: string; startTime: string; patientName: string | null }

// "My Appointments": sign in with the phone number and 4-digit PIN chosen when
// booking. What appears depends on whether the PIN is verified (see
// lib/modules/patientAccess.ts) — never any medical record.
function MyAppointments() {
  const router = useRouter()
  const params = useSearchParams()
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [state, setState] = useState<'loading' | 'login' | 'reset' | 'list'>('loading')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [visits, setVisits] = useState<PastVisit[]>([])
  const [verified, setVerified] = useState(false)
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/patient/me')
    if (res.status === 401) { setState(params.get('reset') ? 'reset' : 'login'); return }
    const data = await res.json()
    setAppointments(data.appointments ?? [])
    setVerified(!!data.verified)
    setPhone(data.phone ?? '')
    setState('list')
    // Past prescriptions load after the list so a slow or missing one never delays it.
    fetch('/api/patient/prescriptions').then(r => (r.ok ? r.json() : { visits: [] })).then(d => setVisits(d.visits ?? [])).catch(() => setVisits([]))
  }, [params])

  useEffect(() => {
    fetch('/api/public/config').then(r => r.json()).then(d => setTimezone(d.config?.timezone ?? 'Asia/Kolkata')).catch(() => {})
    const saved = getSavedPatients()[0]
    if (saved) setPhone(saved.phone)
    load()
  }, [load])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await fetch('/api/patient/pin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setPin('')
      setError(data.code === 'NO_PIN' ? 'No PIN is set for this number yet. Book an appointment to choose one.' : data.error ?? 'Could not sign in')
      return
    }
    await load()
  }

  const logout = async () => {
    await fetch('/api/patient/pin/login', { method: 'DELETE' })
    setPin(''); setAppointments([]); setVisits([]); setState('login')
  }

  const handleCancel = async (id: string) => {
    if (cancelConfirm !== id) { setCancelConfirm(id); return }
    setCancelling(id); setError('')
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (res.status === 401) { setState('login'); return }
      if (res.ok) {
        setAppointments(prev => prev.filter(a => a.id !== id))
        setCancelConfirm(null)
      } else {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not cancel. Please call the clinic.')
      }
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      <div className="px-4 py-4 flex items-center gap-3" style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => router.push('/')} className="btn btn-ghost p-2 -ml-2" style={{ color: 'rgba(255,255,255,0.70)' }} aria-label="Back to home">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-base" style={{ fontFamily: 'var(--font-display)' }}>My Appointments</h1>
          {state === 'list' && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{phone}</p>}
        </div>
        {state === 'list' && (
          <button onClick={logout} className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.8)' }}><LogOut size={14} /> Sign out</button>
        )}
      </div>

      <div className="page-container-sm py-6 space-y-4">
        {state === 'loading' && (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'var(--color-sage)' }}><div className="spinner" /></div>
        )}

        {state === 'login' && (
          <form onSubmit={login} className="card p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Sign in</h2>
              <p className="text-sm" style={{ color: 'var(--color-sage)' }}>Use the mobile number and 4-digit PIN you chose when you booked.</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Mobile number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                <input id="phone" type="tel" inputMode="tel" className="form-input pl-9" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="tel" />
              </div>
            </div>
            <PinInput id="pin" label="PIN" value={pin} onChange={setPin} />
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary btn-lg w-full" disabled={busy || pin.length !== 4 || phone.replace(/\D/g, '').length < 10}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="text-sm font-medium w-full" style={{ color: 'var(--color-gold-dark)' }} onClick={() => { setError(''); setState('reset') }}>Forgot your PIN?</button>
            <button type="button" className="btn btn-outline w-full" onClick={() => router.push('/')}>Book a new appointment</button>
          </form>
        )}

        {state === 'reset' && (
          <PinReset initialPhone={phone} onDone={async () => { setState('loading'); await load() }} onCancel={() => setState('login')} />
        )}

        {state === 'list' && (
          <>
            {error && <p className="form-error">{error}</p>}
            {appointments.length === 0 ? (
              <div className="card p-8 text-center">
                <Calendar size={40} className="mx-auto mb-3" style={{ color: 'var(--color-sage-light)' }} />
                <p className="font-medium" style={{ color: 'var(--color-sage)' }}>No upcoming appointments</p>
                <button onClick={() => router.push('/')} className="btn btn-primary mt-4">Book an Appointment</button>
              </div>
            ) : (
              appointments.map(appt => (
                <div key={appt.id} className="card p-5 space-y-3 animate-fade-in">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-800">{formatDateTimeInTz(new Date(appt.startTime), timezone)}</p>
                      {appt.patientName && <p className="text-sm text-slate-500 mt-0.5">{appt.patientName}</p>}
                      {appt.chiefComplaint && <p className="text-sm text-slate-500 mt-0.5">{appt.chiefComplaint}</p>}
                    </div>
                    <span className="status-booked">Upcoming</span>
                  </div>

                  {cancelConfirm === appt.id ? (
                    <div className="rounded-lg p-3" style={{ background: 'rgba(181,74,60,0.06)', border: '1px solid rgba(181,74,60,0.18)' }}>
                      <p className="text-sm font-medium flex items-center gap-1.5 mb-3" style={{ color: '#B54A3C' }}>
                        <AlertTriangle size={14} /> Are you sure you want to cancel?
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => handleCancel(appt.id)} className="btn btn-danger flex-1" disabled={cancelling === appt.id}>
                          {cancelling === appt.id ? 'Cancelling...' : 'Yes, Cancel'}
                        </button>
                        <button onClick={() => setCancelConfirm(null)} className="btn btn-ghost flex-1">Keep Appointment</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => handleCancel(appt.id)} className="btn btn-outline w-full text-red-500 border-red-200 hover:bg-red-50">
                      Cancel Appointment
                    </button>
                  )}
                </div>
              ))
            )}

            {visits.length > 0 && (
              <div className="card p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>
                  <FileText size={16} style={{ color: 'var(--color-sage)' }} /> Your prescriptions
                </h2>
                <ul className="divide-y" style={{ borderColor: 'var(--color-sage-border)' }}>
                  {visits.map(v => (
                    <li key={v.appointmentId} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{formatDateTimeInTz(new Date(v.startTime), timezone).split(',')[0]}</p>
                        {v.patientName && <p className="text-xs text-slate-500 truncate">{v.patientName}</p>}
                      </div>
                      <a href={`/api/patient/prescriptions/${v.appointmentId}/pdf`} download className="btn btn-outline btn-sm shrink-0">
                        <Download size={14} /> Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!verified && (
              <div className="rounded-lg p-4 text-sm space-y-2" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--color-sage-border)' }}>
                <p style={{ color: 'var(--color-charcoal-mid)' }}>
                  This list shows appointments you booked here. To also see appointments the clinic booked for you, confirm your number with a WhatsApp code.
                </p>
                <button className="font-semibold" style={{ color: 'var(--color-forest)' }} onClick={() => setState('reset')}>Confirm my number</button>
              </div>
            )}

            <button onClick={() => router.push('/')} className="btn btn-primary w-full">Book New Appointment</button>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  )
}

export default function AppointmentsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return <Suspense fallback={null}><MyAppointments /></Suspense>
}
