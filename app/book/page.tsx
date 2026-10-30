'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Home, Calendar, Clock, CheckCircle2, ChevronRight, Download } from 'lucide-react'
import { computeAge } from '@/lib/slots'
import { addDaysYmd, describeYmd, formatDateTimeInTz, formatSlotLabelInTz } from '@/lib/time'
import { createGoogleCalendarUrl, downloadIcsFile } from '@/lib/calendar'
import { getDraft, savePatient, setDraft, type BookingDraft } from '@/lib/patientDevice'
import PinInput from '@/components/patient/PinInput'
import SiteFooter from '@/components/SiteFooter'
import { PageShell, Container } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { LoadingBlock } from '@/components/ui/Spinner'

interface TimeSlot { start: string; end: string; label: string }
interface BlockedPeriod { startTime: string; endTime: string; reason: string | null }
interface BookedAppointment {
  id: string
  startTime: string
  endTime?: string
  chiefComplaint?: string
  doctor?: { name?: string; clinicName?: string; address?: string; phone?: string }
}

export default function BookPage() {
  const router = useRouter()
  const [draft, setDraftState] = useState<BookingDraft | null>(null)
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [today, setToday] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([])
  const [slotDurationMins, setSlotDurationMins] = useState<number | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [step, setStep] = useState<'select' | 'confirm' | 'success'>('select')
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  // PIN step: clinic staff don't need one; patients choose one the first time and enter it after.
  const [isStaff, setIsStaff] = useState(false)
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointment | null>(null)

  useEffect(() => {
    const d = getDraft()
    if (!d) { router.replace('/register'); return }
    setDraftState(d)
    ;(async () => {
      try {
        const me = await (await fetch('/api/auth/session')).json()
        if (me.authenticated) { setIsStaff(true); return }
        const s = await fetch('/api/patient/pin/status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: d.patient.phone }),
        })
        if (s.ok) setHasPin((await s.json()).hasPin)
      } catch { /* the booking itself will report what is needed */ }
    })()
    // The clinic's own date and timezone drive every picker, not this device's.
    fetch('/api/public/config').then(r => r.json()).then(({ config }) => {
      setTimezone(config.timezone)
      setToday(config.today)
      setSelectedDate(config.today)
    })
  }, [router])

  const fetchSlots = useCallback(async (date: string) => {
    setLoadingSlots(true)
    setSlots([]); setBlockedPeriods([]); setSelectedSlot(null)
    try {
      const res = await fetch(`/api/appointments?mode=slots&date=${date}`)
      const data = await res.json()
      setSlots(data.slots ?? [])
      setBlockedPeriods(data.blockedPeriods ?? [])
      setSlotDurationMins(data.slotDurationMins ?? null)
    } catch {
      // leave the list empty; the empty state tells the patient to try another day
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => { if (draft && selectedDate) fetchSlots(selectedDate) }, [draft, selectedDate, fetchSlots])

  const handleBook = async () => {
    if (!selectedSlot || !draft) return
    setBooking(true)
    setError('')
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: draft.patient,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          chiefComplaint: draft.chiefComplaint,
          ...(isStaff ? {} : { pin }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Booking failed. Please try another slot.')
        if (res.status === 409) { setStep('select'); fetchSlots(selectedDate) } // slot just taken: show what is left
        if (data.code === 'PIN_REQUIRED') setHasPin(true)
        if (data.code === 'PIN_SETUP_REQUIRED') setHasPin(false)
        if (data.code === 'PIN_WRONG' || data.code === 'PIN_WEAK') setPin('')
        return
      }

      // Keep the details for next time, and the secret that lets this device
      // view or cancel this one appointment.
      savePatient(draft.patient)
      setDraft(null) // the details now live in the saved profile; don't leave a copy in this tab
      setBookedAppointment(data.appointment)
      setStep('success')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBooking(false)
    }
  }

  if (!draft) return null

  const patient = draft.patient
  const age = (() => { try { return computeAge(patient.dob) } catch { return null } })()
  const at = (iso: string) => formatDateTimeInTz(new Date(iso), timezone)
  const dateOptions = today ? Array.from({ length: 14 }, (_, i) => addDaysYmd(today, i)) : []

  // ── Success ──────────────────────────────────────────────────────────
  if (step === 'success' && bookedAppointment) {
    const clinic = bookedAppointment.doctor
    const eventTitle = `Doctor Appointment - ${clinic?.clinicName || 'Clinic'}`
    const eventDescription = `Appointment with ${clinic?.name || 'Doctor'} at ${clinic?.clinicName || 'Clinic'}.\nPatient: ${patient.name}\n${bookedAppointment.chiefComplaint ? `Chief Complaint: ${bookedAppointment.chiefComplaint}\n` : ''}${clinic?.phone ? `Clinic Phone: ${clinic.phone}` : ''}`
    const eventLocation = clinic?.address || clinic?.clinicName || 'Clinic'
    const apptEndTime = bookedAppointment.endTime || selectedSlot?.end || bookedAppointment.startTime
    const calendarEvent = { id: bookedAppointment.id, title: eventTitle, description: eventDescription, location: eventLocation, startTime: bookedAppointment.startTime, endTime: apptEndTime }

    return (
      <PageShell>
        <PageHeader title="Appointment Confirmed!" subtitle={at(bookedAppointment.startTime)} />

        <Container className="flex flex-col items-center justify-center">
          <div className="card p-6 sm:p-8 max-w-md w-full text-center animate-slide-up">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(28,92,70,0.12)' }}>
              <CheckCircle2 size={40} style={{ color: 'var(--color-pine)' }} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Appointment Confirmed!</h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--color-sage)' }}>
              Your appointment is booked for <strong style={{ color: 'var(--color-charcoal)' }}>{at(bookedAppointment.startTime)}</strong>
            </p>

            <div className="rounded-lg p-4 mb-5 text-left space-y-2" style={{ background: 'var(--color-linen-dark)', border: '1px solid var(--color-sage-border)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Patient</span>
                <span className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{patient.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Date &amp; Time</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{at(bookedAppointment.startTime)}</span>
              </div>
              {clinic?.clinicName && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-sage)' }}>Clinic</span>
                  <span className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{clinic.clinicName}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl p-4 mb-6 text-left" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--color-sage-border)' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--color-forest)' }}>
                <Calendar size={14} /> Add to Calendar
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <a href={createGoogleCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer"
                  className="btn btn-outline text-xs py-2 px-2.5 flex items-center justify-center gap-2 rounded-lg font-medium"
                  style={{ background: '#FFFEF9', borderColor: 'var(--color-sage-border)', color: 'var(--color-charcoal)' }}>
                  Google Calendar
                </a>
                <button type="button" onClick={() => downloadIcsFile(calendarEvent, `appointment-${patient.name.toLowerCase().replace(/\s+/g, '-')}.ics`)}
                  className="btn btn-outline text-xs py-2 px-2.5 flex items-center justify-center gap-1.5 rounded-lg font-medium"
                  style={{ background: '#FFFEF9', borderColor: 'var(--color-sage-border)', color: 'var(--color-charcoal)' }}>
                  <Download size={14} className="shrink-0" style={{ color: 'var(--color-pine)' }} />
                  iCal / Apple
                </button>
              </div>
            </div>

            <p className="text-sm mb-6" style={{ color: 'var(--color-sage)' }}>
              We&apos;ve sent a confirmation to {patient.phone} on WhatsApp, and we&apos;ll remind you before your visit. To view or cancel it, open <strong>My Appointments</strong> and enter your PIN, or call the clinic.
            </p>

            <div className="flex flex-col gap-3">
              <button onClick={() => router.push('/appointments')} className="btn btn-primary w-full">My Appointments</button>
              <button onClick={() => router.push('/')} className="btn btn-ghost w-full" style={{ color: 'var(--color-sage)' }}>Back to Home</button>
            </div>
          </div>
        </Container>
        <SiteFooter />
      </PageShell>
    )
  }

  // ── Confirm ──────────────────────────────────────────────────────────
  if (step === 'confirm' && selectedSlot) {
    const day = describeYmd(selectedDate)
    return (
      <PageShell>
        <PageHeader title="Confirm Appointment" onBack={() => setStep('select')} />

        <Container className="space-y-4">
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Appointment Summary</h2>
            <div className="space-y-3">
              {[
                ['Patient', patient.name],
                ...(age !== null ? [['Age', `${age} years`]] : []),
                ['Phone', patient.phone],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-sage)' }}>{k}</span>
                  <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{v}</span>
                </div>
              ))}
              <hr className="divider" />
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Date</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{day.weekdayLong}, {day.day} {day.monthShort}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Time</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>
                  {formatSlotLabelInTz(new Date(selectedSlot.start), timezone)} – {formatSlotLabelInTz(new Date(selectedSlot.end), timezone)}
                </span>
              </div>
            </div>
          </div>

          {isStaff ? (
            <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--color-sage-border)' }}>
              Booking as clinic staff — no PIN needed. The patient will get the confirmation and reminders.
            </div>
          ) : (
            <div className="card p-6 space-y-3">
              {hasPin ? (
                <>
                  <h2 className="font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Enter your PIN</h2>
                  <PinInput id="pin" label="4-digit PIN" value={pin} onChange={setPin} autoFocus />
                  <a href="/appointments?reset=1" className="link-action">Forgot your PIN?</a>
                </>
              ) : (
                <>
                  <h2 className="font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Choose a 4-digit PIN</h2>
                  <p className="text-sm" style={{ color: 'var(--color-sage)' }}>You will need it to view or cancel your appointments. Don&apos;t share it.</p>
                  <PinInput id="pin" label="PIN" value={pin} onChange={setPin} autoFocus />
                  <PinInput id="pin2" label="Type it again" value={pinConfirm} onChange={setPinConfirm}
                    hint={pinConfirm.length === 4 && pin !== pinConfirm ? 'The two PINs do not match' : undefined} />
                </>
              )}
            </div>
          )}

          {error && <Alert>{error}</Alert>}
          <Button size="lg" block onClick={handleBook} loading={booking} disabled={!isStaff && (pin.length !== 4 || (hasPin === false && pin !== pinConfirm))}>
            {booking ? 'Booking...' : 'Confirm Booking'}
          </Button>
        </Container>
        <SiteFooter />
      </PageShell>
    )
  }

  // ── Select a date and time ───────────────────────────────────────────
  return (
    <PageShell>
      <PageHeader title="Book Appointment" subtitle={`${patient.name}${age !== null ? ` · ${age} years` : ''}`} />

      <Container className="space-y-5">
        <div className="flex gap-2">
          <button onClick={() => router.push('/')} className="btn btn-outline flex-1 font-semibold" style={{ borderWidth: 2, borderColor: 'var(--color-forest)', color: 'var(--color-forest)' }}>
            <Home size={16} /> Back to home
          </button>
          {/* replace, not push: editing details must not add another history entry to bounce between */}
          <button onClick={() => router.replace('/register')} className="btn btn-ghost flex-1">Edit patient details</button>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm" style={{ color: 'var(--color-charcoal)' }}>
            <Calendar size={15} style={{ color: 'var(--color-sage)' }} /> Select Date
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {dateOptions.map(d => {
              const p = describeYmd(d)
              const isSelected = d === selectedDate
              return (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className="shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-lg transition-all text-sm font-medium"
                  style={{
                    background: isSelected ? 'var(--color-forest)' : '#FFFEF9',
                    color: isSelected ? 'white' : 'var(--color-charcoal-mid)',
                    border: isSelected ? '1.5px solid var(--color-forest)' : '1.5px solid var(--color-sage-border)',
                    boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                  }}>
                  <span className="text-xs" style={{ opacity: isSelected ? 0.80 : 0.65 }}>{p.weekdayShort}</span>
                  <span className="text-lg font-bold font-tabular">{p.day}</span>
                  {d === today && <span className="text-xs" style={{ color: isSelected ? 'var(--color-gold)' : 'var(--color-sage)' }}>Today</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm" style={{ color: 'var(--color-charcoal)' }}>
            <Clock size={15} style={{ color: 'var(--color-sage)' }} />
            Available Slots{selectedDate ? ` — ${describeYmd(selectedDate).weekdayLong}, ${describeYmd(selectedDate).day} ${describeYmd(selectedDate).monthShort}` : ''}
          </h3>
          {slotDurationMins != null && (
            <p className="text-xs mb-3" style={{ color: 'var(--color-sage)' }}>Each appointment is {slotDurationMins} minutes</p>
          )}

          {!loadingSlots && blockedPeriods.length > 0 && (
            <Alert variant="warning" className="mb-3 text-xs">
            <div className="space-y-1">
              {blockedPeriods.map((b, i) => (
                <p key={i}>
                  Doctor unavailable {formatSlotLabelInTz(new Date(b.startTime), timezone)} – {formatSlotLabelInTz(new Date(b.endTime), timezone)}
                  {b.reason ? ` (${b.reason})` : ''}
                </p>
              ))}
            </div>
            </Alert>
          )}

          {loadingSlots ? (
            <LoadingBlock className="py-8" label="Loading slots" />
          ) : slots.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--color-sage)' }}>
              <Clock size={32} className="mx-auto mb-2" style={{ opacity: 0.35 }} />
              <p className="text-sm">No slots available on this day</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Try selecting another date</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map(slot => {
                const isSelected = selectedSlot?.start === slot.start
                return (
                  <button key={slot.start} onClick={() => setSelectedSlot(slot)}
                    className="py-2.5 px-2 rounded-lg text-sm font-medium font-tabular transition-all"
                    style={{
                      background: isSelected ? 'var(--color-forest)' : '#FFFEF9',
                      color: isSelected ? 'white' : 'var(--color-charcoal-mid)',
                      border: `1.5px solid ${isSelected ? 'var(--color-forest)' : 'var(--color-sage-border)'}`,
                      boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                    }}>
                    {slot.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && <Alert>{error}</Alert>}
        <button onClick={() => selectedSlot && setStep('confirm')} className="btn btn-primary btn-lg w-full" disabled={!selectedSlot}>
          Continue <ChevronRight size={18} />
        </button>
      </Container>
      <SiteFooter />
    </PageShell>
  )
}
