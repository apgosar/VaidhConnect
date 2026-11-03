'use client'

import { useState } from 'react'
import { CalendarClock, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { readFailure, networkFailureText } from '@/lib/clientErrors'

/**
 * What staff can do to a booked visit: move it to another time, or cancel it. Cancelling asks once more inside the
 * dialog (it tells the patient on WhatsApp and frees the time), so a mis-tap cannot cancel a visit.
 */
export function EditVisitDialog({ open, appointmentId, patientName, whenText, onClose, onReschedule, onCancelled }: {
  open: boolean
  appointmentId: string
  patientName: string
  /** The visit's current time, already formatted. */
  whenText: string
  onClose: () => void
  onReschedule: () => void
  onCancelled: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => { if (!busy) { setConfirming(false); setError(''); onClose() } }

  const cancelVisit = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (!res.ok) { setError(await readFailure(res, 'Could not cancel this appointment.')); return }
      setConfirming(false)
      onCancelled()
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={confirming ? 'Cancel this appointment?' : 'Edit appointment'} onClose={close} role={confirming ? 'alertdialog' : 'dialog'}>
      <p className="text-sm text-slate-600"><strong>{patientName}</strong> · {whenText}</p>
      {error && <Alert variant="error">{error}</Alert>}

      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">The time becomes free for someone else, and {patientName} is told on WhatsApp that it is cancelled.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-outline" onClick={() => { setConfirming(false); setError('') }} disabled={busy}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={cancelVisit} disabled={busy}>{busy ? 'Cancelling...' : 'Yes, cancel it'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button type="button" onClick={onReschedule} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50">
            <CalendarClock size={20} className="shrink-0 text-blue-600" aria-hidden="true" />
            <span><span className="block font-medium text-slate-800">Reschedule</span><span className="block text-xs text-slate-500">Move it to another day or time</span></span>
          </button>
          <button type="button" onClick={() => setConfirming(true)} className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-white p-4 text-left hover:bg-red-50">
            <XCircle size={20} className="shrink-0 text-red-600" aria-hidden="true" />
            <span><span className="block font-medium text-red-700">Cancel appointment</span><span className="block text-xs text-slate-500">Frees the time and tells the patient</span></span>
          </button>
        </div>
      )}
    </Modal>
  )
}
