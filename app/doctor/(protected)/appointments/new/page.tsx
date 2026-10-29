'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, UserPlus, CheckCircle2, Clock, X } from 'lucide-react'
import { addDaysYmd, describeYmd } from '@/lib/time'

interface PatientHit { id: string; name: string; phone: string; dob?: string }
interface Slot { start: string; end: string; label: string }

const emptyNew = { name: '', phone: '+91', dob: '', email: '', medicalHistory: '' }

export default function NewAppointmentPage() {
  const [config, setConfig] = useState<{ today: string; timezone: string; enableChiefComplaint: boolean } | null>(null)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PatientHit[]>([])
  const [patient, setPatient] = useState<PatientHit | null>(null)
  const [fresh, setFresh] = useState(emptyNew)
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [complaint, setComplaint] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState<{ label: string; name: string } | null>(null)
  const searchSeq = useRef(0)

  useEffect(() => {
    fetch('/api/public/config').then(r => r.json()).then(d => {
      setConfig(d.config)
      setDate(d.config.today)
    })
  }, [])

  // Debounced patient search
  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) { setHits([]); return }
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query.trim())}&limit=8`)
      if (!res.ok || seq !== searchSeq.current) return
      setHits((await res.json()).patients ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [query, mode])

  const loadSlots = (d: string) => {
    setLoadingSlots(true); setSlot(null)
    return fetch(`/api/appointments?mode=slots&date=${d}`)
      .then(r => r.json())
      .then(r => setSlots(r.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }

  useEffect(() => { if (date) loadSlots(date) }, [date])

  const dates = config ? Array.from({ length: 14 }, (_, i) => addDaysYmd(config.today, i)) : []

  const canBook =
    !!slot && (mode === 'existing' ? !!patient : fresh.name.trim().length >= 2 && fresh.phone.length >= 8 && !!fresh.dob)

  const book = async () => {
    if (!slot) return
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      startTime: slot.start, endTime: slot.end, chiefComplaint: complaint || undefined,
      ...(mode === 'existing'
        ? { patientId: patient!.id }
        : { patient: { ...fresh, email: fresh.email || undefined, medicalHistory: fresh.medicalHistory || undefined } }),
    }
    const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not book this appointment')
      if (res.status === 409) loadSlots(date) // someone took it — show what is still open
      return
    }
    setBooked({ label: `${describeYmd(date).weekdayLong}, ${describeYmd(date).day} ${describeYmd(date).monthShort} at ${slot.label}`, name: mode === 'existing' ? patient!.name : fresh.name })
  }

  const reset = () => {
    setBooked(null); setPatient(null); setQuery(''); setFresh(emptyNew); setComplaint(''); setSlot(null); setError('')
    if (config) setDate(config.today)
  }

  if (!config) return <div className="flex justify-center py-20"><div className="spinner" /></div>

  if (booked) {
    return (
      <div className="max-w-lg mx-auto card p-8 text-center space-y-4 animate-fade-in">
        <CheckCircle2 size={44} className="mx-auto" style={{ color: 'var(--color-pine)' }} />
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>Appointment booked</h1>
        <p className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>
          <strong>{booked.name}</strong> · {booked.label}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-sage)' }}>A WhatsApp confirmation has been sent to the patient.</p>
        <div className="flex gap-3 justify-center pt-2">
          <button className="btn btn-primary" onClick={reset}>Book another</button>
          <Link href="/doctor/calendar" className="btn btn-outline">View calendar</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>New Appointment</h1>

      {/* 1. Patient */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">1. Patient</h2>
          <div className="flex gap-1 text-sm">
            <button className={`btn btn-sm ${mode === 'existing' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('existing')}><Search size={14} /> Find</button>
            <button className={`btn btn-sm ${mode === 'new' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('new')}><UserPlus size={14} /> New patient</button>
          </div>
        </div>

        {mode === 'existing' ? (
          patient ? (
            <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'var(--color-primary-bg)' }}>
              <div><p className="font-medium">{patient.name}</p><p className="text-xs" style={{ color: 'var(--color-sage)' }}>{patient.phone}</p></div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPatient(null)} aria-label="Choose a different patient"><X size={16} /></button>
            </div>
          ) : (
            <div className="space-y-2">
              <input className="form-input" placeholder="Search by name or phone (min 2 characters)" value={query} onChange={e => setQuery(e.target.value)} />
              {hits.map(h => (
                <button key={h.id} className="w-full text-left rounded-lg p-3 hover:bg-[var(--color-primary-bg)] border" style={{ borderColor: 'var(--color-sage-border)' }} onClick={() => setPatient(h)}>
                  <span className="font-medium">{h.name}</span> <span className="text-xs" style={{ color: 'var(--color-sage)' }}>{h.phone}</span>
                </button>
              ))}
              {query.trim().length >= 2 && hits.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-sage)' }}>No match. Use “New patient” to add them.</p>
              )}
            </div>
          )
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="form-group"><label className="form-label">Full name *</label><input className="form-input" value={fresh.name} onChange={e => setFresh(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Mobile (with country code) *</label><input className="form-input" inputMode="tel" value={fresh.phone} onChange={e => setFresh(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Date of birth *</label><input type="date" className="form-input" value={fresh.dob} max={config.today} onChange={e => setFresh(f => ({ ...f, dob: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Email (optional)</label><input type="email" className="form-input" value={fresh.email} onChange={e => setFresh(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
        )}
      </section>

      {/* 2. When */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">2. Date &amp; time</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dates.map(d => {
            const p = describeYmd(d), sel = d === date
            return (
              <button key={d} onClick={() => setDate(d)} className="shrink-0 w-14 h-16 rounded-lg flex flex-col items-center justify-center text-sm"
                style={{ background: sel ? 'var(--color-forest)' : 'transparent', color: sel ? 'white' : 'var(--color-charcoal-mid)', border: `1.5px solid ${sel ? 'var(--color-forest)' : 'var(--color-sage-border)'}` }}>
                <span className="text-xs opacity-80">{p.weekdayShort}</span><span className="text-lg font-bold">{p.day}</span>
              </button>
            )
          })}
        </div>
        {loadingSlots ? <div className="flex justify-center py-6"><div className="spinner" /></div>
          : slots.length === 0 ? <p className="text-sm flex items-center gap-2" style={{ color: 'var(--color-sage)' }}><Clock size={15} /> No open slots on this day.</p>
          : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {slots.map(s => (
                <button key={s.start} onClick={() => setSlot(s)} className="py-2 rounded-lg text-sm font-medium"
                  style={{ background: slot?.start === s.start ? 'var(--color-forest)' : 'transparent', color: slot?.start === s.start ? 'white' : 'var(--color-charcoal-mid)', border: `1.5px solid ${slot?.start === s.start ? 'var(--color-forest)' : 'var(--color-sage-border)'}` }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
      </section>

      {config.enableChiefComplaint && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold">3. Reason for visit <span className="text-xs font-normal" style={{ color: 'var(--color-sage)' }}>(optional)</span></h2>
          <textarea className="form-textarea" rows={2} maxLength={500} value={complaint} onChange={e => setComplaint(e.target.value)} />
        </section>
      )}

      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={!canBook || saving} onClick={book}>
        {saving ? 'Booking…' : 'Book appointment'}
      </button>
    </div>
  )
}
