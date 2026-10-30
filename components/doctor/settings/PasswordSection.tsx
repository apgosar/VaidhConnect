'use client'

import { useState } from 'react'
import { failureText, networkFailureText } from '@/lib/clientErrors'
import { Section } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'

const MIN_LENGTH = 10

/** Settings → Change Password. Self-contained: it does not touch the rest of the settings form. */
export function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('Passwords do not match'); return }
    if (next.length < MIN_LENGTH) { setError(`Password must be at least ${MIN_LENGTH} characters`); return }
    setBusy(true)
    try {
      const res = await fetch('/api/doctor/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(failureText(data, 'Could not change the password')); return }
      setChanged(true)
      setCurrent(''); setNext(''); setConfirm('')
      // Every session is revoked on a password change, so sign in again.
      setTimeout(() => { window.location.href = '/doctor/login' }, 1500)
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Change Password">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Current Password" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
        <TextField label="New Password" type="password" autoComplete="new-password" hint={`At least ${MIN_LENGTH} characters`} minLength={MIN_LENGTH} value={next} onChange={e => setNext(e.target.value)} required />
        <TextField label="Confirm New Password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        {error && <Alert>{error}</Alert>}
        {changed && <Alert variant="success">Password changed. Signing you out so you can sign in again…</Alert>}
        <Button type="submit" loading={busy}>Update Password</Button>
      </form>
    </Section>
  )
}
