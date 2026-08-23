'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function DoctorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const idToken = await userCredential.user.getIdToken()
      
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      })

      if (res.ok) {
        router.push('/doctor/dashboard')
        router.refresh()
      } else {
        setError('Failed to establish session. Please try again.')
        await auth.signOut()
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    setError('')

    try {
      await sendPasswordResetEmail(auth, forgotEmail)
      setForgotSent(true)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to send password reset email.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-linen)' }}
    >
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-md"
            style={{ background: 'var(--color-forest)', border: '1px solid rgba(201,161,93,0.25)' }}
          >
            🌿
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
          >
            Doctor Portal
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-sage)' }}>Sign in to manage your clinic</p>
        </div>

        <div className="card p-8 shadow-lg">
          {!forgotMode ? (
            <>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="form-group">
                  <label className="form-label" htmlFor="email">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                    <input
                      id="email"
                      type="email"
                      className="form-input pl-9"
                      placeholder="doctor@clinic.app"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="password">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input pl-9 pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--color-sage)' }}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    className="rounded-lg px-4 py-3 text-sm"
                    style={{ background: 'rgba(181,74,60,0.08)', border: '1px solid rgba(181,74,60,0.20)', color: '#B54A3C' }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <><div className="spinner w-4 h-4" style={{ borderTopColor: 'var(--color-forest)' }} /><span>Signing in...</span></>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <button
                onClick={() => { setForgotMode(true); setForgotEmail(email) }}
                className="mt-4 text-center w-full text-sm font-medium"
                style={{ color: 'var(--color-gold-dark)' }}
              >
                Forgot password?
              </button>
            </>
          ) : (
            <>
              {!forgotSent ? (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div>
                    <h2
                      className="font-bold mb-1"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
                    >
                      Reset Password
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--color-sage)' }}>Enter your email to receive a reset link.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="forgot-email">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                      <input
                        id="forgot-email"
                        type="email"
                        className="form-input pl-9"
                        placeholder="doctor@clinic.app"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  {error && (
                    <div
                      className="rounded-lg px-4 py-3 text-sm"
                      style={{ background: 'rgba(181,74,60,0.08)', border: '1px solid rgba(181,74,60,0.20)', color: '#B54A3C' }}
                    >
                      {error}
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary w-full" disabled={forgotLoading}>
                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <button type="button" onClick={() => setForgotMode(false)} className="btn btn-ghost w-full text-sm">
                    Back to Login
                  </button>
                </form>
              ) : (
                <div className="text-center py-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'rgba(28,92,70,0.10)' }}
                  >
                    <Mail size={24} style={{ color: 'var(--color-pine)' }} />
                  </div>
                  <h2
                    className="font-bold mb-2"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
                  >
                    Check your email
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-sage)' }}>
                    If that email exists, a reset link has been sent.
                  </p>
                  <button onClick={() => setForgotMode(false)} className="btn btn-primary w-full">
                    Back to Login
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--color-sage-light)' }}>
          Default credentials: doctor@clinic.app / changeme123
        </p>
      </div>
    </div>
  )
}
