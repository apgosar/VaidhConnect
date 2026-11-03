'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Home, User, Heart, Phone, Mail } from 'lucide-react'
import { ageFromDob } from '@/lib/time'
import type { Gender } from '@/lib/gender'
import { AgeDobFields, ageDobAsDob, ageDobComplete, ageDobFromDob, emptyAgeDob, type AgeDob } from '@/components/ui/AgeDobFields'
import { GenderField } from '@/components/ui/GenderField'
import { getDraft, setDraft } from '@/lib/patientDevice'
import { splitPhone } from '@/lib/phoneSplit'
import { PageShell, Container } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

interface RegisterClientProps {
  config: {
    enableChiefComplaint: boolean
    enableMedicalHistory: boolean
  }
}

export default function RegisterClient({ config }: RegisterClientProps) {
  const router = useRouter()
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  // Age and date of birth keep each other up to date; the date is sent either way (an estimate when only the age was typed).
  const [ageDob, setAgeDob] = useState<AgeDob>(emptyAgeDob)
  const [gender, setGender] = useState<Gender | ''>('')
  const today = new Date().toLocaleDateString('en-CA')
  const [form, setForm] = useState({
    name: '',
    medicalHistory: '',
    email: '',
    chiefComplaint: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const d = getDraft()
    if (!d) return
    const p = d.patient
    const split = splitPhone(p.phone)
    if (split) { setCountryCode(split.countryCode); setPhoneNumber(split.national) }
    setAgeDob(p.dobApproximate ? { ...ageDobFromDob(p.dob, today), age: String(ageFromDob(p.dob, today)), entered: 'age' } : ageDobFromDob(p.dob, today))
    setGender(p.gender ?? '')
    setForm({ name: p.name, medicalHistory: p.medicalHistory ?? '', email: p.email ?? '', chiefComplaint: d.chiefComplaint ?? '' })
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const digits = phoneNumber.replace(/[\s\-()]/g, '')
    if (!form.name.trim() || !ageDobComplete(ageDob) || !gender || !digits || (config?.enableChiefComplaint !== false && !form.chiefComplaint.trim())) {
      setError('Please fill in all required fields')
      return
    }
    const phone = countryCode.trim() + digits
    if (!/^\+\d{8,15}$/.test(phone)) {
      setError('Enter a valid mobile number, e.g. +91 98765 43210')
      return
    }

    // Nothing is sent to the clinic until the appointment is confirmed, so
    // there's no server call here — details just move on to choosing a time.
    setDraft({
      patient: {
        name: form.name.trim(),
        phone,
        ...ageDobAsDob(ageDob, today),
        gender,
        email: form.email.trim() || undefined,
        medicalHistory: form.medicalHistory.trim() || undefined,
      },
      chiefComplaint: form.chiefComplaint.trim() || undefined,
    })
    router.replace('/book')
  }

  return (
    <PageShell>
      <PageHeader title="Patient details" subtitle="Step 1 of 2 · then choose a time" />

      <Container>
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
                  onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))}
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            {/* Mobile number */}
            <div className="form-group">
              <label className="form-label" htmlFor="phone">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input text-center font-medium"
                  style={{ width: '72px' }}
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  aria-label="Country code"
                  maxLength={5}
                />
                <div className="relative flex-1">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                  <input
                    id="phone"
                    type="tel"
                    className="form-input pl-9 w-full"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    required
                    autoComplete="tel"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Your confirmation and reminders are sent on WhatsApp to this number.</p>
            </div>

            {/* Age and date of birth: type either, the other is worked out */}
            <AgeDobFields value={ageDob} onChange={setAgeDob} today={today} />

            <GenderField value={gender} onChange={setGender} />

            {/* Chief Complaint */}
            {config?.enableChiefComplaint !== false && (
              <div className="form-group">
                <label className="form-label" htmlFor="chiefComplaint">
                  Chief Complaint <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="chiefComplaint"
                  className="form-textarea"
                  placeholder="What brings you in today? (e.g. fever and headache for 3 days)"
                  value={form.chiefComplaint}
                  onChange={e => setForm((p: any) => ({ ...p, chiefComplaint: e.target.value }))}
                  required
                  rows={3}
                />
              </div>
            )}

            {/* Medical History */}
            {config?.enableMedicalHistory !== false && (
              <div className="form-group">
                <label className="form-label" htmlFor="medicalHistory">
                  Medical History <span className="text-slate-500 text-xs font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Heart size={16} className="absolute left-3 top-3" style={{ color: 'var(--color-sage)' }} />
                  <textarea
                    id="medicalHistory"
                    className="form-textarea pl-9"
                    placeholder="Any known conditions, allergies, current medications..."
                    value={form.medicalHistory}
                    onChange={e => setForm((p: any) => ({ ...p, medicalHistory: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email <span className="text-slate-500 text-xs font-normal">(for reminders — optional)</span>
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sage)' }} />
                <input
                  id="email"
                  type="email"
                  className="form-input pl-9"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm((p: any) => ({ ...p, email: e.target.value }))}
                  autoComplete="email"
                />
              </div>
            </div>

            {error && <Alert>{error}</Alert>}

            <Button type="submit" size="lg" block loading={loading}>
              {loading ? 'Saving...' : 'Continue to Book Appointment'}
            </Button>

            <Button variant="outline" size="lg" block className="font-semibold" style={{ borderWidth: 2, borderColor: 'var(--color-forest)', color: 'var(--color-forest)' }} onClick={() => router.push('/')}>
              <Home size={18} aria-hidden="true" /> Back to home
            </Button>
          </form>
        </div>
      </Container>
    </PageShell>
  )
}
