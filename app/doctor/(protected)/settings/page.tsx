'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, SessionProvider } from 'next-auth/react'
import { Save, Upload, X, Check, Palette, Copy } from 'lucide-react'
import { SPECIALTIES, DAYS_OF_WEEK, DEFAULT_TIMINGS } from '@/lib/constants'
import type { WeeklyTimings, DayTiming } from '@/lib/constants'
import Image from 'next/image'

interface Doctor {
  name: string; email: string; clinicName: string; logoUrl?: string | null
  address?: string | null; mapsUrl?: string | null; websiteUrl?: string | null; phone?: string | null
  specialty: string; themeColor: string; qualifications?: string | null
  slotDurationMins: number; timings: WeeklyTimings
  paymentDetails: { upiId?: string; bankDetails?: string; qrCodeUrl?: string }
  reminderIntervals: number[]
}

export default function SettingsPage() {
  return (
    <SessionProvider>
      <SettingsPageContent />
    </SessionProvider>
  )
}

function SettingsPageContent() {
  const { update } = useSession()
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(null)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const qrInputRef = useRef<HTMLInputElement>(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/doctor/profile')
      .then(r => r.json())
      .then(d => {
        setDoctor(d.doctor)
        setLoading(false)
      })
  }, [])

  const handleSpecialtyChange = (specialty: string) => {
    const sp = SPECIALTIES.find(s => s.value === specialty)
    setDoctor(prev => prev ? { ...prev, specialty, themeColor: sp?.color ?? prev.themeColor } : prev)
  }

  const handleTimingChange = (day: string, shift: 'morning' | 'evening', field: 'start' | 'end', value: string) => {
    setDoctor(prev => {
      if (!prev) return prev
      const timings = { ...prev.timings } as WeeklyTimings
      const dayTiming = { ...timings[day as keyof WeeklyTimings] } as DayTiming
      dayTiming[shift] = { ...dayTiming[shift], [field]: value } as { start: string; end: string }
      timings[day as keyof WeeklyTimings] = dayTiming
      return { ...prev, timings }
    })
  }

  const handleDayOpenToggle = (day: string) => {
    setDoctor(prev => {
      if (!prev) return prev
      const timings = { ...prev.timings } as WeeklyTimings
      const dayKey = day as keyof WeeklyTimings
      timings[dayKey] = { ...timings[dayKey], open: !timings[dayKey].open }
      return { ...prev, timings }
    })
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('File must be under 2MB'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('File must be under 2MB'); return }
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

  const copyMondayToWeekdays = () => {
    if (!doctor) return
    const monday = (doctor.timings as WeeklyTimings)['monday']
    if (!monday) return
    const weekdays = ['tuesday', 'wednesday', 'thursday', 'friday'] as const
    setDoctor(prev => {
      if (!prev) return prev
      const timings = { ...prev.timings } as WeeklyTimings
      for (const day of weekdays) {
        timings[day] = { ...monday }
      }
      return { ...prev, timings }
    })
  }

  const handleSave = async () => {
    if (!doctor) return
    setSaving(true)
    try {
      // Upload logo if changed
      if (logoFile) {
        const fd = new FormData()
        fd.append('logo', logoFile)
        await fetch('/api/doctor/profile', { method: 'PATCH', body: fd })
      }

      // Upload QR code if changed
      if (qrFile) {
        const fd = new FormData()
        fd.append('qrCode', qrFile)
        const res = await fetch('/api/doctor/profile', { method: 'PATCH', body: fd })
        const data = await res.json()
        // Store the saved QR URL back into doctor state
        if (data.doctor?.qrCodeUrl) {
          setDoctor(p => p ? { ...p, paymentDetails: { ...p.paymentDetails, qrCodeUrl: data.doctor.qrCodeUrl } } : p)
        }
      }

      await fetch('/api/doctor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: doctor.name,
          email: doctor.email,
          clinicName: doctor.clinicName,
          address: doctor.address,
          mapsUrl: doctor.mapsUrl,
          websiteUrl: doctor.websiteUrl,
          phone: doctor.phone,
          specialty: doctor.specialty,
          themeColor: doctor.themeColor,
          qualifications: doctor.qualifications,
          slotDurationMins: doctor.slotDurationMins,
          timings: doctor.timings,
          paymentDetails: doctor.paymentDetails,
          reminderIntervals: doctor.reminderIntervals,
        }),
      })

      await update({
        name: doctor.name,
        clinicName: doctor.clinicName,
        specialty: doctor.specialty,
        themeColor: doctor.themeColor,
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return }

    const res = await fetch('/api/doctor/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setPasswordError(data.error); return }
    setPasswordSuccess(true)
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    setTimeout(() => setPasswordSuccess(false), 3000)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="spinner" /></div>
  if (!doctor) return null

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Settings</h1>
        <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
          {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
        </button>
      </div>

      {/* Clinic Branding */}
      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Clinic Branding</h2>

        {/* Logo */}
        <div className="form-group">
          <label className="form-label">Clinic Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
              {(logoPreview || doctor.logoUrl) ? (
                <Image src={logoPreview ?? doctor.logoUrl!} alt="Logo" width={80} height={80} className="w-full h-full object-contain" />
              ) : (
                <Upload size={24} className="text-slate-300" />
              )}
            </div>
            <div className="space-y-2">
              <button onClick={() => logoInputRef.current?.click()} className="btn btn-outline btn-sm">
                <Upload size={14} /> Upload Logo
              </button>
              <p className="text-xs text-slate-400">PNG, JPG, WebP, SVG · Max 2MB</p>
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </div>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label">Doctor Name</label>
            <input className="form-input" value={doctor.name} onChange={e => setDoctor(p => p ? { ...p, name: e.target.value } : p)} />
          </div>
          <div className="form-group">
            <label className="form-label">Clinic Name</label>
            <input className="form-input" value={doctor.clinicName} onChange={e => setDoctor(p => p ? { ...p, clinicName: e.target.value } : p)} />
          </div>
          <div className="form-group col-span-2">
            <label className="form-label">Qualifications / Degrees</label>
            <input className="form-input" placeholder="e.g. MBBS, MD (Cardiology), FACC" value={doctor.qualifications ?? ''} onChange={e => setDoctor(p => p ? { ...p, qualifications: e.target.value } : p)} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={doctor.email} onChange={e => setDoctor(p => p ? { ...p, email: e.target.value } : p)} />
          </div>
          <div className="form-group">
            <label className="form-label">Clinic Phone</label>
            <input type="tel" className="form-input" placeholder="+91 98765 43210" value={doctor.phone ?? ''} onChange={e => setDoctor(p => p ? { ...p, phone: e.target.value } : p)} />
          </div>
          <div className="form-group col-span-2">
            <label className="form-label">Clinic Address</label>
            <textarea className="form-textarea" rows={2} value={doctor.address ?? ''} onChange={e => setDoctor(p => p ? { ...p, address: e.target.value } : p)} />
          </div>
          <div className="form-group col-span-2">
            <label className="form-label">Google Maps URL <span className="text-slate-400 text-xs">(share link for "Get Directions" button)</span></label>
            <input className="form-input" placeholder="https://maps.google.com/..." value={doctor.mapsUrl ?? ''} onChange={e => setDoctor(p => p ? { ...p, mapsUrl: e.target.value } : p)} />
          </div>
          <div className="form-group col-span-2">
            <label className="form-label">Clinic Website <span className="text-slate-400 text-xs">(optional)</span></label>
            <input className="form-input" placeholder="https://www.yourclinic.com" value={doctor.websiteUrl ?? ''} onChange={e => setDoctor(p => p ? { ...p, websiteUrl: e.target.value } : p)} />
          </div>
        </div>
      </div>

      {/* Specialty & Theme */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Specialty & Theme</h2>
        <div className="form-group">
          <label className="form-label">Specialty</label>
          <select className="form-select" value={doctor.specialty} onChange={e => handleSpecialtyChange(e.target.value)}>
            {SPECIALTIES.map(s => (
              <option key={s.value} value={s.value}>{s.icon} {s.value}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label flex items-center gap-2">
            <Palette size={14} /> Accent Color <span className="text-slate-400 text-xs">(auto-set by specialty, override here)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
              value={doctor.themeColor}
              onChange={e => setDoctor(p => p ? { ...p, themeColor: e.target.value } : p)}
            />
            <input className="form-input w-36" value={doctor.themeColor} onChange={e => setDoctor(p => p ? { ...p, themeColor: e.target.value } : p)} placeholder="#3B82F6" />
            <div className="flex gap-2 flex-wrap">
              {SPECIALTIES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setDoctor(p => p ? { ...p, themeColor: s.color } : p)}
                  title={s.value}
                  className="w-6 h-6 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-110"
                  style={{ backgroundColor: s.color }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Appointment Settings</h2>
        <div className="form-group">
          <label className="form-label">Slot Duration (minutes)</label>
          <select className="form-select" value={doctor.slotDurationMins} onChange={e => setDoctor(p => p ? { ...p, slotDurationMins: parseInt(e.target.value) } : p)}>
            {[5, 10, 15, 20, 30, 45, 60].map(d => (
              <option key={d} value={d}>{d} minutes</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Reminder Intervals (hours before appointment)</label>
          <div className="flex gap-3 flex-wrap">
            {[1, 2, 4, 6, 12, 24, 48].map(h => {
              const active = (doctor.reminderIntervals ?? []).includes(h)
              return (
                <button
                  key={h}
                  onClick={() => {
                    const current = doctor.reminderIntervals ?? []
                    const updated = active ? current.filter(x => x !== h) : [...current, h].sort((a, b) => b - a)
                    setDoctor(p => p ? { ...p, reminderIntervals: updated } : p)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  {h}h
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Clinic Timings */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-semibold text-slate-800">Clinic Timings</h2>
          <button
            type="button"
            onClick={copyMondayToWeekdays}
            className="btn btn-outline btn-sm flex items-center gap-1.5"
            title="Copy Monday timings to Tue–Fri"
          >
            <Copy size={13} /> Copy Mon → Weekdays
          </button>
        </div>
        <div className="space-y-4">
          {DAYS_OF_WEEK.map(day => {
            const timing = (doctor.timings as WeeklyTimings)[day] ?? DEFAULT_TIMINGS[day]
            // Detect full-day mode: no meaningful evening timing
            const isFullDay = timing.open &&
              timing.morning?.start && timing.morning?.end &&
              (!timing.evening?.start && !timing.evening?.end)

            return (
              <div key={day} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => handleDayOpenToggle(day)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${timing.open ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${timing.open ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="font-medium text-slate-700 capitalize">{day}</span>
                  </label>
                  {!timing.open && <span className="text-xs text-red-400">Closed</span>}
                </div>

                {timing.open && (
                  <div className="pl-12 space-y-2">
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // Switch to shift mode: restore default morning + evening
                          handleTimingChange(day, 'morning', 'start', '09:00')
                          handleTimingChange(day, 'morning', 'end', '13:00')
                          handleTimingChange(day, 'evening', 'start', '17:00')
                          handleTimingChange(day, 'evening', 'end', '20:00')
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${!isFullDay ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                      >
                        Morning + Evening
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Switch to full-day mode: morning has full range, clear evening
                          handleTimingChange(day, 'morning', 'start', timing.morning?.start || '10:00')
                          handleTimingChange(day, 'morning', 'end', timing.evening?.end || '21:00')
                          handleTimingChange(day, 'evening', 'start', '')
                          handleTimingChange(day, 'evening', 'end', '')
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${isFullDay ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                      >
                        Full Day
                      </button>
                    </div>

                    {isFullDay ? (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400 font-medium">HOURS</p>
                        <div className="flex gap-2 items-center">
                          <input type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.start ?? ''} onChange={e => handleTimingChange(day, 'morning', 'start', e.target.value)} />
                          <span className="text-slate-400 text-xs">–</span>
                          <input type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.end ?? ''} onChange={e => handleTimingChange(day, 'morning', 'end', e.target.value)} />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs text-slate-400 font-medium">MORNING</p>
                          <div className="flex gap-2 items-center">
                            <input type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.start ?? ''} onChange={e => handleTimingChange(day, 'morning', 'start', e.target.value)} />
                            <span className="text-slate-400 text-xs">–</span>
                            <input type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.end ?? ''} onChange={e => handleTimingChange(day, 'morning', 'end', e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-slate-400 font-medium">EVENING</p>
                          <div className="flex gap-2 items-center">
                            <input type="time" className="form-input text-sm py-1.5 flex-1" value={timing.evening?.start ?? ''} onChange={e => handleTimingChange(day, 'evening', 'start', e.target.value)} />
                            <span className="text-slate-400 text-xs">–</span>
                            <input type="time" className="form-input text-sm py-1.5 flex-1" value={timing.evening?.end ?? ''} onChange={e => handleTimingChange(day, 'evening', 'end', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment Details */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Payment Details</h2>
        <div className="form-group">
          <label className="form-label">UPI ID</label>
          <input className="form-input" placeholder="doctor@upi" value={doctor.paymentDetails?.upiId ?? ''} onChange={e => setDoctor(p => p ? { ...p, paymentDetails: { ...p.paymentDetails, upiId: e.target.value } } : p)} />
        </div>
        <div className="form-group">
          <label className="form-label">Bank Details</label>
          <textarea className="form-textarea" rows={2} placeholder="Bank name, Account no, IFSC..." value={doctor.paymentDetails?.bankDetails ?? ''} onChange={e => setDoctor(p => p ? { ...p, paymentDetails: { ...p.paymentDetails, bankDetails: e.target.value } } : p)} />
        </div>
        <div className="form-group">
          <label className="form-label">QR Code Image</label>
          <div className="flex items-center gap-4">
            <div className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
              {(qrPreview || doctor.paymentDetails?.qrCodeUrl) ? (
                <Image src={qrPreview ?? doctor.paymentDetails?.qrCodeUrl!} alt="QR Code" width={112} height={112} className="w-full h-full object-contain" />
              ) : (
                <Upload size={24} className="text-slate-300" />
              )}
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => qrInputRef.current?.click()} className="btn btn-outline btn-sm">
                <Upload size={14} /> Upload QR Code
              </button>
              <p className="text-xs text-slate-400">PNG, JPG · Max 2MB</p>
            </div>
            <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input type="password" className="form-input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input type="password" className="form-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
          {passwordError && <p className="form-error">{passwordError}</p>}
          {passwordSuccess && <p className="text-green-600 text-sm">Password changed successfully!</p>}
          <button type="submit" className="btn btn-primary">Update Password</button>
        </form>
      </div>

      {/* Save button at bottom too */}
      <button onClick={handleSave} className="btn btn-primary btn-lg w-full" disabled={saving}>
        {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving...' : <><Save size={16} /> Save All Settings</>}
      </button>
    </div>
  )
}
