'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'

/**
 * Desk tools for a patient's 4-digit PIN.
 *  - Reset: patient phoned saying they forgot it; they choose a new one on their next booking.
 *  - Set at desk: the patient is standing here, so ownership is checked in person and the
 *    PIN counts as verified (lets them see every appointment on that number).
 * The PIN is never shown, stored in the audit log, or kept in this component after sending.
 */
export default function PatientPinActions({ phone }: { phone: string }) {
  const [mode, setMode] = useState<'idle' | 'set'>('idle')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const send = async (body: object, done: string) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/doctor/patient-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setMsg({ ok: true, text: done }); setMode('idle') }
      else setMsg({ ok: false, text: data.error ?? 'Something went wrong' })
    } finally {
      setPin(''); setBusy(false)
    }
  }

  return (
    <div className="card-data p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={15} style={{ color: 'var(--color-sage)' }} />
        <h3 className="font-semibold text-sm" style={{ color: 'var(--color-charcoal)' }}>Patient PIN</h3>
      </div>

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-outline btn-sm" disabled={busy}
            onClick={() => { if (confirm('Reset this patient\'s PIN? They will be signed out and choose a new one on their next booking.')) send({ action: 'reset', phone }, 'PIN reset. The patient will choose a new one on their next booking.') }}
          >Reset PIN</button>
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setMsg(null); setMode('set') }}>Set PIN at desk</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password" inputMode="numeric" autoComplete="off" maxLength={4} aria-label="New 4-digit PIN"
            className="form-input text-center font-semibold tracking-[0.5em]" style={{ maxWidth: '8rem' }}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <button className="btn btn-primary btn-sm" disabled={busy || pin.length !== 4} onClick={() => send({ action: 'set', phone, pin }, 'PIN set. Tell the patient to keep it private.')}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setMode('idle'); setPin('') }}>Cancel</button>
        </div>
      )}

      {msg && <p className="text-xs" style={{ color: msg.ok ? 'var(--color-forest)' : '#B54A3C' }}>{msg.text}</p>}
    </div>
  )
}
