'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await cred.user.getIdToken() }),
      })
      if (!res.ok) { await auth.signOut(); setError((await res.json()).error ?? 'Sign-in failed'); return }
      router.push('/admin')
    } catch {
      setError('Incorrect email or password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="main-content" role="main" className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-linen)' }}>
      <form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Platform console</h1>
          <p className="text-sm" style={{ color: 'var(--color-sage)' }}>Operators only</p>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="e">Email</label><input id="e" type="email" className="form-input" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>
        <div className="form-group"><label className="form-label" htmlFor="p">Password</label><input id="p" type="password" className="form-input" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
