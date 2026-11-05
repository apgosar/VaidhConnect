'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, Minus, Plus } from 'lucide-react'
import { addDaysYmd, describeYmd, formatSlotLabelInTz } from '@/lib/time'
import { MAX_SLOTS_PER_VISIT } from '@/lib/slots'
import { ageDobAsDob } from '@/components/ui/AgeDobFields'
import { PatientEntryFields, usePatientEntry } from '@/components/doctor/PatientEntry'
import { LoadingBlock } from '@/components/ui/Spinner'

interface Slot { start: string; end: string; label: string }

export default function NewAppointmentPage() {
  const [config, setConfig] = useState<{ today: string; timezone: string; enableChiefComplaint: boolean } | null>(null)
  const entry = usePatientEntry(config?.today ?? new Date().toISOString().slice(0, 10))
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  // How many slots long the visit is. One is the usual; staff can lengthen it a slot at a time.
  const [count, setCount] = useState(1)
  const [complaint, setComplaint] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState<{ label: string; name: string; minutes: number } | null>(null)

  useEffect(() => {
    fetch('/api/public/config').then(r => r.json()).then(d => {
      setConfig(d.config)
      setDate(d.config.today)
    })
  }, [])

  const loadSlots = (d: string) => {
    setLoadingSlots(true); setSlot(null); setCount(1)
    return fetch(`/api/appointments?mode=slots&date=${d}`)
      .then(r => r.json())
      .then(r => setSlots(r.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }

  useEffect(() => { if (date) loadSlots(date) }, [date])

  const dates = config ? Array.from({ length: 14 }, (_, i) => addDaysYmd(config.today, i)) : []

  // Longer visits: each extra slot must be open straight after the chosen one, so the length stops where the free time stops.
  const slotMs = slot ? new Date(slot.end).getTime() - new Date(slot.start).getTime() : 0
  const openAt = new Set(slots.map(s => s.start))
  let maxCount = 1
  if (slot) while (maxCount < MAX_SLOTS_PER_VISIT && openAt.has(new Date(new Date(slot.start).getTime() + maxCount * slotMs).toISOString())) maxCount++
  const visitEnd = slot ? new Date(new Date(slot.start).getTime() + count * slotMs) : null
  const minutes = (count * slotMs) / 60_000
  const pickSlot = (s: Slot) => { setSlot(s); setCount(1) }

  const canBook = !!slot && !entry.problem

  const book = async () => {
    if (!slot) return
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      startTime: slot.start, endTime: visitEnd!.toISOString(), chiefComplaint: complaint || undefined,
      ...(entry.chosen
        ? { patientId: entry.chosen.id }
        : { patient: { name: entry.name.trim(), phone: entry.phone, ...ageDobAsDob(entry.ageDob, config!.today), gender: entry.gender || undefined } }),
    }
    const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not book this appointment')
      if (res.status === 409) loadSlots(date) // someone took it — show what is still open
      return
    }
    setBooked({ label: `${describeYmd(date).weekdayLong}, ${describeYmd(date).day} ${describeYmd(date).monthShort} at ${slot.label}`, name: entry.chosen?.name ?? entry.name.trim(), minutes })
  }

  const reset = () => {
    setBooked(null); entry.reset(); setCount(1); setComplaint(''); setSlot(null); setError('')
    if (config) setDate(config.today)
  }

  if (!config) return <LoadingBlock className="py-20" />

  if (booked) {
    return (
      <div className="max-w-lg mx-auto card p-8 text-center space-y-4 animate-fade-in">
        <CheckCircle2 size={44} className="mx-auto" style={{ color: 'var(--color-pine)' }} />
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>Appointment booked</h1>
        <p className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>
          <strong>{booked.name}</strong> · {booked.label}{booked.minutes > 0 ? ` · ${booked.minutes} min` : ''}
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
      <section className="card p-5 space-y-4" aria-labelledby="appt-patient">
        <h2 id="appt-patient" className="font-semibold">1. Patient</h2>
        <PatientEntryFields entry={entry} idPrefix="appt" numberHint="A WhatsApp confirmation is sent to this number." />
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
        {loadingSlots ? <LoadingBlock className="py-6" label="Loading times" />
          : slots.length === 0 ? <p className="text-sm flex items-center gap-2" style={{ color: 'var(--color-sage)' }}><Clock size={15} /> No open slots on this day.</p>
          : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {slots.map(s => (
                <button key={s.start} onClick={() => pickSlot(s)} className="py-2 rounded-lg text-sm font-medium"
                  style={{ background: slot?.start === s.start ? 'var(--color-forest)' : 'transparent', color: slot?.start === s.start ? 'white' : 'var(--color-charcoal-mid)', border: `1.5px solid ${slot?.start === s.start ? 'var(--color-forest)' : 'var(--color-sage-border)'}` }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

        {slot && visitEnd && (
          <div className="rounded-lg p-3 flex flex-wrap items-center justify-between gap-3" style={{ background: 'var(--color-primary-bg)' }} role="group" aria-label="Appointment length">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-charcoal)' }}>Appointment length</p>
              <p className="text-xs" style={{ color: 'var(--color-sage)' }} aria-live="polite">{slot.label} to {formatSlotLabelInTz(visitEnd, config.timezone)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} onClick={() => setCount(c => Math.max(1, c - 1))} disabled={count <= 1} aria-label="Shorter by one slot">
                <Minus size={16} aria-hidden="true" />
              </button>
              <span className="min-w-[4.5rem] text-center font-semibold font-tabular" data-testid="visit-minutes">{minutes} min</span>
              <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} onClick={() => setCount(c => Math.min(maxCount, c + 1))} disabled={count >= maxCount} aria-label="Longer by one slot">
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
            {count >= maxCount && maxCount < MAX_SLOTS_PER_VISIT && <p className="w-full text-xs" style={{ color: 'var(--color-sage)' }}>The next slot is not free, so this is as long as it can be here.</p>}
          </div>
        )}
      </section>

      {config.enableChiefComplaint && (
        <section className="card p-5 space-y-2">
          <h2 className="font-semibold">3. Reason for visit <span className="text-xs font-normal" style={{ color: 'var(--color-sage)' }}>(optional)</span></h2>
          <textarea aria-label="Reason for visit" className="form-textarea" rows={2} maxLength={500} value={complaint} onChange={e => setComplaint(e.target.value)} />
        </section>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={!canBook || saving} onClick={book}>
        {saving ? 'Booking…' : 'Book appointment'}
      </button>
    </div>
  )
}
