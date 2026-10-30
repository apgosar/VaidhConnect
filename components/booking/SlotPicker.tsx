'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { addDaysYmd, describeYmd, formatSlotLabelInTz } from '@/lib/time'
import { LoadingBlock } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'

export interface Slot { start: string; end: string; label: string }
interface Blocked { startTime: string; endTime: string; reason: string | null }

const DAYS_AHEAD = 14

/**
 * Pick a day and a time from the clinic's open slots (the same list patients see when booking).
 * Used wherever a time is chosen for an existing appointment (rescheduling). `refreshKey` makes it
 * reload the slots, e.g. after the chosen one was taken in the meantime.
 */
export function SlotPicker({ value, onChange, refreshKey = 0 }: {
  value: Slot | null
  onChange: (slot: Slot | null) => void
  refreshKey?: number
}) {
  const [today, setToday] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [blocked, setBlocked] = useState<Blocked[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  // the clinic's own date and timezone drive the picker, not this device's
  useEffect(() => {
    fetch('/api/public/config').then(r => r.json()).then(({ config }) => {
      setTimezone(config.timezone); setToday(config.today); setDate(config.today)
    }).catch(() => setFailed(true))
  }, [])

  const load = useCallback(async (d: string) => {
    setLoading(true); setFailed(false); setSlots([]); setBlocked([])
    try {
      const res = await fetch(`/api/appointments?mode=slots&date=${d}`)
      if (!res.ok) throw new Error('slots')
      const data = await res.json()
      setSlots(data.slots ?? []); setBlocked(data.blockedPeriods ?? [])
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (date) load(date) }, [date, load, refreshKey])

  const days = today ? Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysYmd(today, i)) : []

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Choose a day" className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {days.map(d => {
          const p = describeYmd(d)
          const selected = d === date
          return (
            <button
              key={d} type="button" aria-pressed={selected} aria-label={`${p.weekdayLong} ${p.day} ${p.monthShort}${d === today ? ', today' : ''}`}
              onClick={() => { setDate(d); onChange(null) }}
              className="shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-lg text-sm font-medium transition-all"
              style={{
                background: selected ? 'var(--color-forest)' : '#FFFEF9',
                color: selected ? '#FFFFFF' : 'var(--color-charcoal-mid)',
                border: `1.5px solid ${selected ? 'var(--color-forest)' : 'var(--color-border-input)'}`,
              }}
            >
              <span className="text-xs">{p.weekdayShort}</span>
              <span className="text-lg font-bold font-tabular">{p.day}</span>
            </button>
          )
        })}
      </div>

      {!loading && blocked.length > 0 && (
        <Alert variant="warning" className="text-xs">
          <div className="space-y-1">
            {blocked.map((b, i) => (
              <p key={i}>Doctor unavailable {formatSlotLabelInTz(new Date(b.startTime), timezone)} – {formatSlotLabelInTz(new Date(b.endTime), timezone)}{b.reason ? ` (${b.reason})` : ''}</p>
            ))}
          </div>
        </Alert>
      )}

      {loading ? (
        <LoadingBlock className="py-8" label="Loading times" />
      ) : failed ? (
        <Alert>Could not load the available times. Please try again.</Alert>
      ) : slots.length === 0 ? (
        <div className="text-center py-6" style={{ color: 'var(--color-sage)' }}>
          <Clock size={28} className="mx-auto mb-2" style={{ opacity: 0.4 }} aria-hidden="true" />
          <p className="text-sm">No times are available on this day.</p>
          <p className="text-xs mt-1">Try another day.</p>
        </div>
      ) : (
        <div role="group" aria-label="Choose a time" className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map(slot => {
            const selected = value?.start === slot.start
            return (
              <button
                key={slot.start} type="button" aria-pressed={selected} onClick={() => onChange(slot)}
                className="py-2.5 px-2 rounded-lg text-sm font-medium font-tabular transition-all min-h-[44px]"
                style={{
                  background: selected ? 'var(--color-forest)' : '#FFFEF9',
                  color: selected ? '#FFFFFF' : 'var(--color-charcoal-mid)',
                  border: `1.5px solid ${selected ? 'var(--color-forest)' : 'var(--color-border-input)'}`,
                }}
              >
                {slot.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
