'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Calendar, Heart, Phone, Mail } from 'lucide-react'
import { computeAge } from '@/lib/slots'

export default function RegisterPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [form, setForm] = useState({
    name: '',
    dob: '',
    medicalHistory: '',
    email: '',
    chiefComplaint: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [age, setAge] = useState<number | null>(null)

  useEffect(() => {
    const storedPhone = sessionStorage.getItem('phone')
    if (!storedPhone) {
      router.replace('/')
      return
    }
    setPhone(storedPhone)
  }, [router])

  useEffect(() => {
    if (form.dob) {
      try {
        setAge(computeAge(form.dob))
      } catch {
        setAge(null)
      }
    }
  }, [form.dob])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.dob || !form.chiefComplaint) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, ...form }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
        return
      }

      // Store patient and redirect to booking
      sessionStorage.setItem('patient', JSON.stringify(data.patient))
      sessionStorage.setItem('chiefComplaint', form.chiefComplaint)
      router.push('/book')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* Header */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={() => router.back()} className="btn btn-ghost p-2 -ml-2" aria-label="Go back"
          style={{ color: 'rgba(255,255,255,0.70)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1
            className="font-bold text-white text-base leading-snug"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            New Patient Registration
          </h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{phone}</p>
        </div>
      </div>

      <div className="page-container-sm py-6">
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="form-group">
              <label className="form-label" htmlFor="name">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                <input
                  id="name"
                  type="text"
                  className="form-input pl-9"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            {/* Date of Birth */}
            <div className="form-group">
              <label className="form-label" htmlFor="dob">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                <input
                  id="dob"
                  type="date"
                  className="form-input pl-9"
                  value={form.dob}
                  onChange={e => setForm(p => ({ ...p, dob: e.target.value }))}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              {age !== null && (
                <p className="text-sm mt-1" style={{ color: 'var(--color-sage)' }}>
                  Age: <strong style={{ color: 'var(--color-charcoal)' }}>{age} years</strong>
                </p>
              )}
            </div>

            {/* Chief Complaint */}
            <div className="form-group">
              <label className="form-label" htmlFor="chiefComplaint">
                Chief Complaint <span className="text-red-500">*</span>
              </label>
              <textarea
                id="chiefComplaint"
                className="form-textarea"
                placeholder="What brings you in today? (e.g. fever and headache for 3 days)"
                value={form.chiefComplaint}
                onChange={e => setForm(p => ({ ...p, chiefComplaint: e.target.value }))}
                required
                rows={3}
              />
            </div>

            {/* Medical History */}
            <div className="form-group">
              <label className="form-label" htmlFor="medicalHistory">
                Medical History <span className="text-slate-400 text-xs font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Heart size={16} className="absolute left-3 top-3" style={{ color: 'var(--color-sage)' }} />
                <textarea
                  id="medicalHistory"
                  className="form-textarea pl-9"
                  placeholder="Any known conditions, allergies, current medications..."
                  value={form.medicalHistory}
                  onChange={e => setForm(p => ({ ...p, medicalHistory: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email <span className="text-slate-400 text-xs font-normal">(for reminders — optional)</span>
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                <input
                  id="email"
                  type="email"
                  className="form-input pl-9"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  autoComplete="email"
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

            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
            >
              {loading ? (
                <><div className="spinner w-4 h-4" style={{ borderTopColor: 'var(--color-forest)' }} /><span>Saving...</span></>
              ) : (
                'Continue to Book Appointment'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
