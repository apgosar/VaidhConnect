'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, LogOut, FileText, Download } from 'lucide-react'
import { formatDateTimeInTz } from '@/lib/time'
import { getSavedPatients } from '@/lib/patientDevice'
import { failureText, readFailure, networkFailureText } from '@/lib/clientErrors'
import PinInput from '@/components/patient/PinInput'
import PinReset from '@/components/patient/PinReset'
import SiteFooter from '@/components/SiteFooter'
import { PageShell, Container } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { LoadingBlock } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { LangText } from '@/components/ui/LangText'

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
    try {
      const res = await fetch('/api/patient/pin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPin('')
        setError(data.code === 'NO_PIN' ? 'No PIN is set for this number yet. Book an appointment to choose one.' : failureText(data, 'Could not sign in'))
        return
      }
      await load()
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
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
        setError(await readFailure(res, 'Could not cancel. Please call the clinic.'))
      }
    } catch {
      setError(networkFailureText())
    } finally {
      setCancelling(null)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="My Appointments"
        subtitle={state === 'list' ? phone : undefined}
        right={state === 'list' ? (
          <Button variant="ghost" size="sm" onClick={logout} style={{ color: '#fff' }}><LogOut size={14} aria-hidden="true" /> Sign out</Button>
        ) : undefined}
      />

      <Container className="space-y-4">
        {state === 'loading' && <LoadingBlock />}

        {state === 'login' && (
          <form onSubmit={login} className="card p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Sign in</h2>
              <p className="text-sm" style={{ color: 'var(--color-sage)' }}>Use the mobile number and 4-digit PIN you chose when you booked.</p>
            </div>
            <TextField label="Mobile number" type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="tel" />
            <PinInput id="pin" label="PIN" value={pin} onChange={setPin} />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={pin.length !== 4 || phone.replace(/\D/g, '').length < 10}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <button type="button" className="link-action w-full" onClick={() => { setError(''); setState('reset') }}>Forgot your PIN?</button>
            <Button variant="outline" block onClick={() => router.push('/')}>Book a new appointment</Button>
          </form>
        )}

        {state === 'reset' && (
          <PinReset initialPhone={phone} onDone={async () => { setState('loading'); await load() }} onCancel={() => setState('login')} />
        )}

        {state === 'list' && (
          <>
            {error && <Alert>{error}</Alert>}
            {appointments.length === 0 ? (
              <EmptyState
                icon={<Calendar size={40} />}
                title="No upcoming appointments"
                action={<Button onClick={() => router.push('/')}>Book an Appointment</Button>}
              />
            ) : (
              appointments.map(appt => (
                <div key={appt.id} className="card p-5 space-y-3 animate-fade-in">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-800">{formatDateTimeInTz(new Date(appt.startTime), timezone)}</p>
                      {appt.patientName && <p className="text-sm text-slate-500 mt-0.5"><LangText>{appt.patientName}</LangText></p>}
                      {appt.chiefComplaint && <p className="text-sm text-slate-500 mt-0.5">{appt.chiefComplaint}</p>}
                    </div>
                    <span className="status-booked">Upcoming</span>
                  </div>

                  {cancelConfirm === appt.id ? (
                    <Alert variant="warning">
                      <p className="font-medium mb-3">Are you sure you want to cancel?</p>
                      <div className="flex gap-2">
                        <Button variant="danger" className="flex-1" loading={cancelling === appt.id} onClick={() => handleCancel(appt.id)}>
                          {cancelling === appt.id ? 'Cancelling...' : 'Yes, Cancel'}
                        </Button>
                        <Button variant="ghost" className="flex-1" onClick={() => setCancelConfirm(null)}>Keep Appointment</Button>
                      </div>
                    </Alert>
                  ) : (
                    <Button variant="outline" block className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleCancel(appt.id)}>
                      Cancel Appointment
                    </Button>
                  )}
                </div>
              ))
            )}

            {visits.length > 0 && (
              <div className="card p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>
                  <FileText size={16} style={{ color: 'var(--color-sage)' }} aria-hidden="true" /> Your prescriptions
                </h2>
                <ul className="divide-y" style={{ borderColor: 'var(--color-sage-border)' }}>
                  {visits.map(v => (
                    <li key={v.appointmentId} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{formatDateTimeInTz(new Date(v.startTime), timezone).split(',')[0]}</p>
                        {v.patientName && <p className="text-xs text-slate-500 truncate"><LangText>{v.patientName}</LangText></p>}
                      </div>
                      <a href={`/api/patient/prescriptions/${v.appointmentId}/pdf`} download className="btn btn-outline btn-sm shrink-0">
                        <Download size={14} aria-hidden="true" /> Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!verified && (
              <Alert variant="info">
                <p>This list shows appointments you booked here. To also see appointments the clinic booked for you, confirm your number with a WhatsApp code.</p>
                <button type="button" className="link-action" onClick={() => setState('reset')}>Confirm my number</button>
              </Alert>
            )}

            <Button block onClick={() => router.push('/')}>Book New Appointment</Button>
          </>
        )}
      </Container>
      <SiteFooter />
    </PageShell>
  )
}

export default function AppointmentsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return <Suspense fallback={null}><MyAppointments /></Suspense>
}
