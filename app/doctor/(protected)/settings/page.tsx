'use client'

import { useState, useEffect, useRef } from 'react'
import { Save, Upload, X, Check, Palette, Copy } from 'lucide-react'
import { SPECIALTIES, DAYS_OF_WEEK, DEFAULT_TIMINGS } from '@/lib/constants'
import type { WeeklyTimings, DayTiming } from '@/lib/constants'
import Image from 'next/image'
import { Alert } from '@/components/ui/Alert'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { failureText, networkFailureText } from '@/lib/clientErrors'
import { DEFAULT_MARGINS, MARGIN_LIMITS, type PrintMargins } from '@/lib/pdf/layout'
import { LoadingBlock } from '@/components/ui/Spinner'

interface Doctor {
  name: string; email: string; clinicName: string; logoUrl?: string | null
  address?: string | null; mapsUrl?: string | null; websiteUrl?: string | null; phone?: string | null
  whatsappPhone?: string | null
  registrationNumber: string; photoUrl?: string | null;
  youtubeLinks: string[];
  products: { id: string; name: string; price: string; description: string; photoUrl?: string }[];
  pageViews: number;
  specialty: string; practiceDescription?: string | null; themeColor: string; theme?: { primary?: string }; qualifications?: string | null
  slotDurationMins: number; timings: WeeklyTimings
  paymentDetails: { upiId?: string; bankDetails?: string; qrCodeUrl?: string }
  reminderIntervals: number[]
  enableChiefComplaint?: boolean
  enableMedicalHistory?: boolean
  consultationFee?: string | null
  followUpFee?: string | null
  summaryHour?: number
  printSettings?: PrintMargins
  letterheadPath?: string | null
}

export default function SettingsPage() {
  return <SettingsPageContent />
}

function SettingsPageContent() {
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
  const [sameAsWhatsapp, setSameAsWhatsapp] = useState(false)
  // Messages that used to be browser pop-ups: they now show on the page where they can be read and announced.
  const [notice, setNotice] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  // Prescription printing: letterhead upload happens on its own (not with Save), spacing saves with the rest.
  const letterheadInputRef = useRef<HTMLInputElement>(null)
  const [letterheadBusy, setLetterheadBusy] = useState(false)
  const [letterheadError, setLetterheadError] = useState('')
  const [letterheadVersion, setLetterheadVersion] = useState(() => Date.now())

  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

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
        // Auto-detect if clinic phone matches whatsapp phone on load
        if (d.doctor?.phone && d.doctor?.whatsappPhone && d.doctor.phone === d.doctor.whatsappPhone) {
          setSameAsWhatsapp(true)
        }
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
    if (file.size > 2 * 1024 * 1024) { setNotice('File must be under 2MB'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setNotice('File must be under 2MB'); return }
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setNotice('File must be under 2MB'); return }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
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

  // YouTube Links Handlers
  const handleAddYoutube = () => {
    setDoctor((p: any) => p ? { ...p, youtubeLinks: [...(p.youtubeLinks || []), ''] } : p)
  }
  const handleYoutubeChange = (index: number, value: string) => {
    setDoctor((p: any) => {
      if (!p) return p
      const links = [...(p.youtubeLinks || [])]
      links[index] = value
      return { ...p, youtubeLinks: links }
    })
  }
  const handleRemoveYoutube = (index: number) => {
    setDoctor((p: any) => p ? { ...p, youtubeLinks: (p.youtubeLinks || []).filter((_: any, i: number) => i !== index) } : p)
  }

  // Products Handlers
  const handleAddProduct = () => {
    setDoctor((p: any) => {
      if (!p || (p.products || []).length >= 10) return p
      return { ...p, products: [...(p.products || []), { id: Date.now().toString(), name: '', price: '', description: '' }] }
    })
  }
  const handleProductChange = (index: number, field: string, value: string) => {
    setDoctor((p: any) => {
      if (!p) return p
      const prods = [...(p.products || [])]
      prods[index] = { ...prods[index], [field]: value }
      return { ...p, products: prods }
    })
  }
  const handleRemoveProduct = (index: number) => {
    setDoctor((p: any) => p ? { ...p, products: (p.products || []).filter((_: any, i: number) => i !== index) } : p)
  }
  const handleProductPhoto = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) { setNotice('Product photo must be under 1MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      handleProductChange(index, 'photoUrl', ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const uploadLetterhead = async (file: File) => {
    setLetterheadBusy(true); setLetterheadError('')
    try {
      const fd = new FormData()
      fd.append('letterhead', file)
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLetterheadError(data.error ?? 'Could not upload the letterhead'); return }
      setDoctor(prev => prev ? { ...prev, letterheadPath: data.doctor?.letterheadPath ?? 'set' } : prev)
      setLetterheadVersion(Date.now())
    } finally {
      setLetterheadBusy(false)
      if (letterheadInputRef.current) letterheadInputRef.current.value = ''
    }
  }

  const removeLetterhead = async () => {
    if (!(await confirm({ title: 'Remove the letterhead?', message: 'Prescriptions will go back to the standard header.', confirmLabel: 'Remove', danger: true }))) return
    setLetterheadBusy(true); setLetterheadError('')
    try {
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removeLetterhead: true }) })
      if (!res.ok) { setLetterheadError((await res.json().catch(() => ({}))).error ?? 'Could not remove the letterhead'); return }
      setDoctor(prev => prev ? { ...prev, letterheadPath: null } : prev)
    } finally {
      setLetterheadBusy(false)
    }
  }

  const margins: PrintMargins = { ...DEFAULT_MARGINS, ...(doctor?.printSettings ?? {}) }
  const setMargin = (key: keyof PrintMargins, value: string) =>
    setDoctor(prev => prev ? { ...prev, printSettings: { ...DEFAULT_MARGINS, ...(prev.printSettings ?? {}), [key]: value === '' ? 0 : Number(value) } } : prev)

  const handleSave = async () => {
    if (!doctor) return
    setSaving(true)
    setNotice(null)
    try {
      let updatedPaymentDetails = { ...doctor.paymentDetails }
      
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
          updatedPaymentDetails.qrCodeUrl = data.doctor.qrCodeUrl
          setDoctor((p: any) => p ? { ...p, paymentDetails: { ...p.paymentDetails, qrCodeUrl: data.doctor.qrCodeUrl } } : p)
        }
      }

      // Upload Doctor Photo if changed
      if (photoFile) {
        const fd = new FormData()
        fd.append('photo', photoFile)
        const res = await fetch('/api/doctor/profile', { method: 'PATCH', body: fd })
        const data = await res.json()
        if (data.doctor?.photoUrl) {
          setDoctor((p: any) => p ? { ...p, photoUrl: data.doctor.photoUrl } : p)
        }
      }

      const res = await fetch('/api/doctor/profile', {
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
          whatsappPhone: doctor.whatsappPhone,
          specialty: doctor.specialty,
          practiceDescription: doctor.practiceDescription,
          themeColor: doctor.themeColor,
          qualifications: doctor.qualifications,
          slotDurationMins: doctor.slotDurationMins,
          timings: doctor.timings,
          paymentDetails: updatedPaymentDetails,
          reminderIntervals: doctor.reminderIntervals,
          registrationNumber: doctor.registrationNumber,
          youtubeLinks: doctor.youtubeLinks || [],
          products: doctor.products || [],
          enableChiefComplaint: doctor.enableChiefComplaint ?? true,
          enableMedicalHistory: doctor.enableMedicalHistory ?? true,
          consultationFee: doctor.consultationFee,
          followUpFee: doctor.followUpFee,
          summaryHour: doctor.summaryHour ?? 10,
          printSettings: margins,
          theme: { primary: doctor.theme?.primary || null },
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setNotice(failureText(errData, 'Failed to save settings'));
        return;
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setNotice(networkFailureText());
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return }
    if (newPassword.length < 10) { setPasswordError('Password must be at least 10 characters'); return }

    const res = await fetch('/api/doctor/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setPasswordError(data.error); return }
    setPasswordSuccess(true)
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    // Every session is revoked on a password change, so sign in again.
    setTimeout(() => { window.location.href = '/doctor/login' }, 1500)
  }

  if (loading) return <LoadingBlock className="py-20" />
  if (!doctor) return null

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Settings</h1>
        <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
          {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
        </button>
      </div>
      {notice && <Alert>{notice}</Alert>}
      {dialog}

      {/* Clinic Branding */}
      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Clinic Branding</h2>

        {/* Logo and Photo Uploads */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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
                <p className="text-xs text-slate-500">Max 2MB</p>
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Doctor Photo (vCard Profile)</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
                {(photoPreview || doctor.photoUrl) ? (
                  <Image src={photoPreview ?? doctor.photoUrl!} alt="Photo" width={80} height={80} className="w-full h-full object-cover" />
                ) : (
                  <Upload size={24} className="text-slate-300" />
                )}
              </div>
              <div className="space-y-2">
                <button onClick={() => photoInputRef.current?.click()} className="btn btn-outline btn-sm">
                  <Upload size={14} /> Upload Photo
                </button>
                <p className="text-xs text-slate-500">Max 2MB</p>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label htmlFor="doctor-name" className="form-label">Doctor Name</label>
            <input id="doctor-name" className="form-input" value={doctor.name} onChange={e => setDoctor((p: any) => p ? { ...p, name: e.target.value } : p)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="registrationNumber">Registration Number</label>
            <input
              id="registrationNumber"
              type="text"
              className="form-input"
              value={doctor.registrationNumber || ''}
              onChange={e => setDoctor(p => p ? { ...p, registrationNumber: e.target.value } : p)}
              placeholder="e.g. MMC-12345"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="consultationFee">Consultation Fee</label>
            <input
              id="consultationFee"
              type="text"
              className="form-input"
              value={doctor.consultationFee || ''}
              onChange={e => setDoctor(p => p ? { ...p, consultationFee: e.target.value } : p)}
              placeholder="e.g. ₹500"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="followUpFee">Follow-up Fee</label>
            <input
              id="followUpFee"
              type="text"
              className="form-input"
              value={doctor.followUpFee || ''}
              onChange={e => setDoctor(p => p ? { ...p, followUpFee: e.target.value } : p)}
              placeholder="e.g. ₹300"
            />
          </div>

          <div className="form-group">
            <label htmlFor="qualifications-degrees" className="form-label">Qualifications / Degrees</label>
            <input id="qualifications-degrees" className="form-input" placeholder="e.g. MBBS, MD (Cardiology)" value={doctor.qualifications ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, qualifications: e.target.value } : p)} />
          </div>
          <div className="form-group">
            <label htmlFor="practice-description" className="form-label">Practice Description (Optional)</label>
            <input id="practice-description" className="form-input" placeholder="e.g. Ayurveda Consultant, Orthopaedic Surgeon" value={doctor.practiceDescription ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, practiceDescription: e.target.value } : p)} />
          </div>
          <div className="form-group sm:col-span-2">
            <label htmlFor="clinic-name" className="form-label">Clinic Name</label>
            <input id="clinic-name" className="form-input" value={doctor.clinicName} onChange={e => setDoctor((p: any) => p ? { ...p, clinicName: e.target.value } : p)} />
          </div>
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input id="email" type="email" className="form-input" value={doctor.email} onChange={e => setDoctor((p: any) => p ? { ...p, email: e.target.value } : p)} />
          </div>

          {/* Dr. WhatsApp Number */}
          <div className="form-group">
            <label className="form-label" htmlFor="whatsappPhone">Dr. WhatsApp Number</label>
            <input
              id="whatsappPhone"
              type="tel"
              className="form-input"
              placeholder="+91 98765 43210"
              value={doctor.whatsappPhone ?? ''}
              onChange={e => {
                const val = e.target.value
                setDoctor((p: any) => p ? { ...p, whatsappPhone: val } : p)
                if (sameAsWhatsapp) {
                  setDoctor((p: any) => p ? { ...p, phone: val } : p)
                }
              }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>
              Used internally to send you schedule notifications (booking confirmations, cancellations, daily summary). This number is never displayed anywhere.
            </p>
          </div>

          {/* Clinic Phone */}
          <div className="form-group">
            <label className="form-label" htmlFor="clinicPhone">Clinic Phone</label>
            <input
              id="clinicPhone"
              type="tel"
              className="form-input"
              placeholder="+91 98765 43210"
              value={doctor.phone ?? ''}
              disabled={sameAsWhatsapp}
              style={sameAsWhatsapp ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
              onChange={e => setDoctor((p: any) => p ? { ...p, phone: e.target.value } : p)}
            />
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sameAsWhatsapp}
                onChange={e => {
                  const checked = e.target.checked
                  setSameAsWhatsapp(checked)
                  if (checked && doctor.whatsappPhone) {
                    setDoctor((p: any) => p ? { ...p, phone: p.whatsappPhone } : p)
                  }
                }}
                className="w-4 h-4 rounded"
                style={{ accentColor: 'var(--color-forest)' }}
              />
              <span className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>Same as Dr. WhatsApp number</span>
            </label>
            <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>
              Shown on the patient-facing landing page and included in WhatsApp messages sent to patients.
            </p>
          </div>
          <div className="form-group col-span-2">
            <label htmlFor="clinic-address" className="form-label">Clinic Address</label>
            <textarea id="clinic-address" className="form-textarea" rows={2} value={doctor.address ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, address: e.target.value } : p)} />
          </div>
          <div className="form-group col-span-2">
            <label htmlFor="google-maps-url" className="form-label">Google Maps URL <span className="text-slate-500 text-xs">(share link for "Get Directions" button)</span></label>
            <input id="google-maps-url" className="form-input" placeholder="https://maps.google.com/..." value={doctor.mapsUrl ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, mapsUrl: e.target.value } : p)} />
          </div>
          <div className="form-group col-span-2">
            <label htmlFor="clinic-website" className="form-label">Clinic Website <span className="text-slate-500 text-xs">(optional)</span></label>
            <input id="clinic-website" className="form-input" placeholder="https://www.yourclinic.com" value={doctor.websiteUrl ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, websiteUrl: e.target.value } : p)} />
          </div>
        </div>
      </div>

      {/* Specialty & Theme */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Specialty & Theme</h2>
        <div className="form-group">
          <label htmlFor="specialty" className="form-label">Specialty</label>
          <select id="specialty" className="form-select" value={doctor.specialty} onChange={e => handleSpecialtyChange(e.target.value)}>
            {SPECIALTIES.map(s => (
              <option key={s.value} value={s.value}>{s.icon} {s.value}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="accent-color" className="form-label flex items-center gap-2">
            <Palette size={14} /> Accent Color <span className="text-slate-500 text-xs">(auto-set by specialty, override here)</span>
          </label>
          <div className="flex items-center gap-3">
            <input id="accent-color"
              type="color"
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
              value={doctor.themeColor}
              onChange={e => setDoctor((p: any) => p ? { ...p, themeColor: e.target.value } : p)}
            />
            <input aria-label="Theme colour, hex value" className="form-input w-36" value={doctor.themeColor} onChange={e => setDoctor((p: any) => p ? { ...p, themeColor: e.target.value } : p)} placeholder="#3B82F6" />
            <div className="flex gap-2 flex-wrap">
              {SPECIALTIES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setDoctor((p: any) => p ? { ...p, themeColor: s.color } : p)}
                  title={s.value}
                  className="w-6 h-6 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-110"
                  style={{ backgroundColor: s.color }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="brand-colour" className="form-label flex items-center gap-2">
            <Palette size={14} /> Brand Colour <span className="text-slate-500 text-xs">(buttons, headers, PDFs and emails)</span>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input id="brand-colour"
              type="color"
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
              value={doctor.theme?.primary || '#0F3D2E'}
              onChange={e => setDoctor((p: any) => p ? { ...p, theme: { primary: e.target.value } } : p)}
            />
            <input aria-label="Brand colour, hex value"
              className="form-input w-36"
              value={doctor.theme?.primary || ''}
              onChange={e => setDoctor((p: any) => p ? { ...p, theme: { primary: e.target.value } } : p)}
              placeholder="Default"
            />
            {doctor.theme?.primary && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDoctor((p: any) => p ? { ...p, theme: { primary: '' } } : p)}>
                Reset to default
              </button>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Pick a mid-to-dark colour: white text sits on top of it. Very light colours are rejected.</p>
        </div>
      </div>

      {/* Appointment Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Appointment Settings</h2>
        <div className="form-group">
          <label htmlFor="slot-duration" className="form-label">Slot Duration (minutes)</label>
          <select id="slot-duration" className="form-select" value={doctor.slotDurationMins} onChange={e => setDoctor((p: any) => p ? { ...p, slotDurationMins: parseInt(e.target.value) } : p)}>
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
                    setDoctor((p: any) => p ? { ...p, reminderIntervals: updated } : p)
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

        {/* Daily Summary Time */}
        <div className="form-group pt-4 border-t border-slate-100">
          <label className="form-label" htmlFor="summaryHour">Daily WhatsApp Summary Time</label>
          <div className="flex items-center gap-3">
            <select
              id="summaryHour"
              className="form-select w-40"
              value={doctor.summaryHour ?? 10}
              onChange={e => setDoctor((p: any) => p ? { ...p, summaryHour: parseInt(e.target.value) } : p)}
            >
              {Array.from({ length: 24 }, (_, i) => {
                const label = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
                return <option key={i} value={i}>{label}</option>
              })}
            </select>
            <p className="text-sm" style={{ color: 'var(--color-sage)' }}>
              You'll receive today's appointment schedule on WhatsApp at this time every day.
            </p>
          </div>
        </div>

        <div className="form-group pt-4 border-t border-slate-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setDoctor((p: any) => p ? { ...p, enableChiefComplaint: !(p.enableChiefComplaint ?? true) } : p)}
              className={`relative w-10 h-5 rounded-full transition-colors ${doctor.enableChiefComplaint ?? true ? 'bg-blue-600' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${doctor.enableChiefComplaint ?? true ? 'translate-x-5' : ''}`} />
            </div>
            <div>
              <span className="font-medium text-slate-700">Enable Chief Complaint Field</span>
              <p className="text-xs text-slate-500 mt-0.5">When enabled, patients will be required to provide their chief complaint during the online booking flow.</p>
            </div>
          </label>
        </div>

        <div className="form-group pt-4 border-t border-slate-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setDoctor((p: any) => p ? { ...p, enableMedicalHistory: !(p.enableMedicalHistory ?? true) } : p)}
              className={`relative w-10 h-5 rounded-full transition-colors ${doctor.enableMedicalHistory ?? true ? 'bg-blue-600' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${doctor.enableMedicalHistory ?? true ? 'translate-x-5' : ''}`} />
            </div>
            <div>
              <span className="font-medium text-slate-700">Enable Medical History Field</span>
              <p className="text-xs text-slate-500 mt-0.5">When enabled, patients will have the option to provide their medical history during the online booking flow.</p>
            </div>
          </label>
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
                  {!timing.open && <span className="text-xs text-red-600">Closed</span>}
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
                        <p className="text-xs text-slate-500 font-medium">HOURS</p>
                        <div className="flex gap-2 items-center">
                          <input aria-label={`${day} start time`} type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.start ?? ''} onChange={e => handleTimingChange(day, 'morning', 'start', e.target.value)} />
                          <span className="text-slate-500 text-xs">–</span>
                          <input aria-label={`${day} end time`} type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.end ?? ''} onChange={e => handleTimingChange(day, 'morning', 'end', e.target.value)} />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 font-medium">MORNING</p>
                          <div className="flex gap-2 items-center">
                            <input aria-label={`${day} morning start time`} type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.start ?? ''} onChange={e => handleTimingChange(day, 'morning', 'start', e.target.value)} />
                            <span className="text-slate-500 text-xs">–</span>
                            <input aria-label={`${day} morning end time`} type="time" className="form-input text-sm py-1.5 flex-1" value={timing.morning?.end ?? ''} onChange={e => handleTimingChange(day, 'morning', 'end', e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 font-medium">EVENING</p>
                          <div className="flex gap-2 items-center">
                            <input aria-label={`${day} evening start time`} type="time" className="form-input text-sm py-1.5 flex-1" value={timing.evening?.start ?? ''} onChange={e => handleTimingChange(day, 'evening', 'start', e.target.value)} />
                            <span className="text-slate-500 text-xs">–</span>
                            <input aria-label={`${day} evening end time`} type="time" className="form-input text-sm py-1.5 flex-1" value={timing.evening?.end ?? ''} onChange={e => handleTimingChange(day, 'evening', 'end', e.target.value)} />
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
          <label htmlFor="upi-id" className="form-label">UPI ID</label>
          <input id="upi-id" className="form-input" placeholder="doctor@upi" value={doctor.paymentDetails?.upiId ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, paymentDetails: { ...p.paymentDetails, upiId: e.target.value } } : p)} />
        </div>
        <div className="form-group">
          <label htmlFor="bank-details" className="form-label">Bank Details</label>
          <textarea id="bank-details" className="form-textarea" rows={2} placeholder="Bank name, Account no, IFSC..." value={doctor.paymentDetails?.bankDetails ?? ''} onChange={e => setDoctor((p: any) => p ? { ...p, paymentDetails: { ...p.paymentDetails, bankDetails: e.target.value } } : p)} />
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
              <p className="text-xs text-slate-500">PNG, JPG · Max 2MB</p>
            </div>
            <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
          </div>
        </div>
      </div>

      {/* Prescription printing */}
      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Prescription Printing</h2>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Letterhead</p>
            <p className="text-sm text-slate-500">
              Upload your letterhead as a full A4 page image (JPG or PNG, up to 5 MB). Prescriptions, downloads and WhatsApp copies are then drawn on it.
              Without one, the standard header with your logo and details is used.
            </p>
          </div>
          {doctor?.letterheadPath ? (
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/doctor/letterhead?v=${letterheadVersion}`} alt="Your letterhead" className="w-28 rounded border border-slate-200 shadow-sm" />
              <div className="space-y-2">
                <button type="button" className="btn btn-outline btn-sm" disabled={letterheadBusy} onClick={() => letterheadInputRef.current?.click()}>
                  <Upload size={14} /> {letterheadBusy ? 'Uploading...' : 'Replace'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm text-red-500 block" disabled={letterheadBusy} onClick={removeLetterhead}>
                  <X size={14} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" disabled={letterheadBusy} onClick={() => letterheadInputRef.current?.click()}>
              <Upload size={14} /> {letterheadBusy ? 'Uploading...' : 'Upload letterhead'}
            </button>
          )}
          <input ref={letterheadInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLetterhead(f) }} />
          {letterheadError && <p className="text-sm text-red-600" role="alert">{letterheadError}</p>}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Spacing for pre-printed letterhead paper</p>
            <p className="text-sm text-slate-500">
              When you tick "Print on letterhead", the prescription is printed without our header or footer. These gaps (in millimetres) keep the text clear of your printed header and footer.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['top', 'bottom', 'left', 'right'] as const).map(key => (
              <div key={key} className="form-group">
                <label className="form-label capitalize" htmlFor={`margin-${key}`}>{key} (mm)</label>
                <input
                  id={`margin-${key}`} type="number" inputMode="decimal" step="0.5"
                  min={MARGIN_LIMITS[key][0]} max={MARGIN_LIMITS[key][1]}
                  className="form-input" value={margins[key]} onChange={e => setMargin(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <a href="/api/doctor/print-test?mode=preprinted" target="_blank" rel="noopener" className="btn btn-outline btn-sm">Print a test page (pre-printed paper)</a>
            <a href="/api/doctor/print-test?mode=standard" target="_blank" rel="noopener" className="btn btn-ghost btn-sm">Preview standard layout</a>
          </div>
          <p className="text-xs text-slate-500">Save your changes first. The test page uses the saved spacing. Print it on your letterhead paper at 100% scale (not "fit to page") and adjust until the text sits where you want it.</p>
        </div>
      </div>

      {/* YouTube Links */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">YouTube Videos</h2>
        <p className="text-sm text-slate-500 mb-2">Embed YouTube videos on your vCard (e.g., patient testimonials, treatments).</p>
        <div className="space-y-3">
          {(doctor.youtubeLinks || []).map((link, idx) => (
            <div key={idx} className="flex gap-2">
              <input aria-label={`YouTube link ${idx + 1}`} 
                className="form-input flex-1" 
                placeholder="https://youtube.com/watch?v=..." 
                value={link} 
                onChange={e => handleYoutubeChange(idx, e.target.value)} 
              />
              <button type="button" onClick={() => handleRemoveYoutube(idx)} className="btn btn-outline text-red-500 border-red-200 hover:bg-red-50 px-3">
                <X size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={handleAddYoutube} className="btn btn-outline btn-sm">
            + Add YouTube Link
          </button>
        </div>
      </div>

      {/* Products Catalog */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Products / Services</h2>
        <p className="text-sm text-slate-500 mb-2">List up to 10 products or services on your vCard. Patients can tap "Enquire" to WhatsApp you about them.</p>
        <div className="space-y-6">
          {(doctor.products || []).map((prod, idx) => (
            <div key={prod.id} className="relative border border-slate-200 rounded-lg p-4 bg-slate-50/50">
              <button type="button" onClick={() => handleRemoveProduct(idx)} className="absolute top-3 right-3 text-red-600 hover:text-red-700">
                <X size={18} />
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-1 flex flex-col items-center gap-2">
                  <label className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center overflow-hidden bg-white cursor-pointer hover:bg-slate-50 transition-colors group relative">
                    {prod.photoUrl ? (
                      <>
                        <Image src={prod.photoUrl} alt={prod.name} width={120} height={120} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Upload size={24} className="text-white drop-shadow-md" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-forest transition-colors">
                        <Upload size={24} />
                        <span className="text-xs font-medium uppercase tracking-wider">Upload Image</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleProductPhoto(idx, e)} />
                  </label>
                </div>
                <div className="sm:col-span-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Product Name</label>
                      <input aria-label="Product Name" className="form-input text-sm" placeholder="e.g. Skin Care Kit" value={prod.name} onChange={e => handleProductChange(idx, 'name', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Price</label>
                      <input aria-label="Price" className="form-input text-sm" placeholder="₹1500" value={prod.price} onChange={e => handleProductChange(idx, 'price', e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Description</label>
                    <textarea aria-label="Description" className="form-textarea text-sm" rows={2} placeholder="Brief description of the product..." value={prod.description} onChange={e => handleProductChange(idx, 'description', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {(doctor.products || []).length < 10 && (
            <button type="button" onClick={handleAddProduct} className="btn btn-outline btn-sm">
              + Add Product ({(doctor.products || []).length}/10)
            </button>
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="form-group">
            <label htmlFor="current-password" className="form-label">Current Password</label>
            <input id="current-password" type="password" className="form-input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="new-password" className="form-label">New Password</label>
            <input id="new-password" type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={10} required />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-new-password" className="form-label">Confirm New Password</label>
            <input id="confirm-new-password" type="password" className="form-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          {passwordSuccess && <p className="text-green-600 text-sm">Password changed. Signing you out so you can sign in again…</p>}
          <button type="submit" className="btn btn-primary">Update Password</button>
        </form>
      </div>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-4 z-40 mt-8">
        <button onClick={handleSave} className="btn btn-primary btn-lg w-full shadow-xl shadow-primary/20 ring-1 ring-black/5" disabled={saving}>
          {saved ? <><Check size={18} /> Saved Successfully!</> : saving ? 'Saving...' : <><Save size={18} /> Save All Settings</>}
        </button>
      </div>
    </div>
  )
}
