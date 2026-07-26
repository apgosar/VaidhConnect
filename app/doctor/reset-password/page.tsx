'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Lock, CheckCircle2 } from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!token) { setError('Invalid reset link'); return }

    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Reset failed')
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/doctor/login'), 3000)
    }
    setLoading(false)
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-500">Invalid or missing reset token.</p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 size={24} className="text-green-600" />
        </div>
        <h2 className="font-bold text-slate-800 mb-2">Password Reset!</h2>
        <p className="text-sm text-slate-500">Redirecting to login...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="font-bold text-slate-800 mb-1">Set New Password</h2>
        <p className="text-sm text-slate-500">Choose a strong password of at least 8 characters.</p>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="new-pass">New Password</label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input id="new-pass" type="password" className="form-input pl-9" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="confirm-pass">Confirm Password</label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input id="confirm-pass" type="password" className="form-input pl-9" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={loading}>
        {loading ? 'Resetting...' : 'Reset Password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="card p-8 shadow-lg">
          <Suspense fallback={<div className="flex justify-center py-4"><div className="spinner" /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
