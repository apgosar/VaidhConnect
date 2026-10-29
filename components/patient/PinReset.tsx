'use client'

import { useState } from 'react'
import PinInput from './PinInput'

interface Props {
  initialPhone: string
  /** Called once the new PIN is set and this device is signed in. */
  onDone: () => void
  onCancel: () => void
}

/**
 * Self-service PIN reset. A one-time code goes to the patient's OWN WhatsApp;
 * entering it proves they own the number, so the PIN they then choose is
 * "verified" (it can see every appointment on the number, not just its own).
 * Patients who can't use WhatsApp call the clinic, who reset it from the desk.
 */
export default function PinReset({ initialPhone, onDone, onCancel }: Props) {
  const [step, setStep] = useState<'request' | 'confirm'>('request')
  const [phone, setPhone] = useState(initialPhone)
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  }

  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const r = await post('/api/patient/pin/reset/request', { phone })
    setBusy(false)
    if (!r.ok) { setError(r.data.error ?? 'Could not send the code. Please call the clinic.'); return }
    setStep('confirm')
  }

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin !== pin2) { setError('The two PINs do not match'); return }
    setBusy(true); setError('')
    const r = await post('/api/patient/pin/reset/confirm', { phone, code, pin })
    setBusy(false)
    if (!r.ok) { setError(r.data.error ?? 'Could not reset the PIN'); return }
    onDone()
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-semibold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Reset your PIN</h2>

      {step === 'request' ? (
        <form onSubmit={request} className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--color-sage)' }}>
            We will send a 6-digit code to your WhatsApp. Anyone who cannot use WhatsApp can simply call the clinic and ask for a PIN reset.
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-phone">Mobile number (with country code)</label>
            <input id="reset-phone" type="tel" inputMode="tel" className="form-input" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={busy || phone.replace(/\D/g, '').length < 10}>{busy ? 'Sending…' : 'Send code'}</button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Back</button>
          </div>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--color-sage)' }}>We sent a code to {phone} on WhatsApp. It is valid for 10 minutes.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-code">6-digit code</label>
            <input id="reset-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="form-input text-center text-lg tracking-[0.4em]" style={{ maxWidth: '12rem' }}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
          </div>
          <PinInput id="reset-pin" label="New 4-digit PIN" value={pin} onChange={setPin} />
          <PinInput id="reset-pin2" label="Type it again" value={pin2} onChange={setPin2} />
          {error && <p className="form-error">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={busy || code.length !== 6 || pin.length !== 4 || pin2.length !== 4}>{busy ? 'Saving…' : 'Set new PIN'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setStep('request'); setError('') }}>Back</button>
          </div>
        </form>
      )}
    </div>
  )
}
