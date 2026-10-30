'use client'

import { useState } from 'react'
import { readFailure, networkFailureText } from '@/lib/clientErrors'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SlotPicker, type Slot } from './SlotPicker'

/**
 * Move an existing appointment to another open time. Used by the patient ("My Appointments") and by the
 * clinic (appointment page); the server decides what each is allowed to do. The appointment keeps its id,
 * so a prescription or payment stays attached, and the patient is told on WhatsApp.
 */
export function RescheduleDialog({ open, appointmentId, currentLabel, patientName, hint, onClose, onMoved }: {
  open: boolean
  appointmentId: string
  /** The current time as the person reads it, e.g. "05 Nov 2026, 09:00 AM". */
  currentLabel: string
  patientName?: string | null
  /** A line about limits ("You can move this 2 more times") shown above the picker. */
  hint?: string
  onClose: () => void
  onMoved: () => void
}) {
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const close = () => { if (!busy) { setSlot(null); setError(''); onClose() } }

  const move = async () => {
    if (!slot) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/reschedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startTime: slot.start, endTime: slot.end }),
      })
      if (res.ok) { setSlot(null); onMoved(); return }
      const data = await res.clone().json().catch(() => ({}))
      setError(await readFailure(res, 'Could not move the appointment. Please try again.'))
      // the chosen time went to someone else while the person was deciding: show what is left
      if (data.code === 'SLOT_TAKEN') { setSlot(null); setRefresh(n => n + 1) }
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Choose a new time" size="lg">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>
          {patientName ? <><strong>{patientName}</strong>, currently </> : 'Currently '}<strong>{currentLabel}</strong>.
        </p>
        {hint && <p className="text-xs" style={{ color: 'var(--color-sage)' }}>{hint}</p>}
        <SlotPicker value={slot} onChange={setSlot} refreshKey={refresh} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>Keep the current time</Button>
          <Button onClick={move} loading={busy} disabled={!slot}>{busy ? 'Moving…' : 'Move appointment'}</Button>
        </div>
      </div>
    </Modal>
  )
}
