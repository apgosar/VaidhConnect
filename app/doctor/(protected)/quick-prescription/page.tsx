'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, FilePlus2, Save, UserRound } from 'lucide-react'
import type { Medicine } from '@/lib/constants'
import { computeAge } from '@/lib/slots'
import { MedicineList, emptyMedicine } from '@/components/doctor/MedicineList'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'
import { readFailure, networkFailureText } from '@/lib/clientErrors'

interface KnownPatient { id: string; name: string; phone: string; dob?: string }
type Share = { state: 'idle' | 'sending' | 'sent' | 'failed'; message?: string }
interface Saved { appointmentId: string; prescriptionId: string; patientName: string; phone: string }

const digits = (s: string) => s.replace(/\D/g, '')
/** What the server will treat as the number: a bare 10-digit number is an Indian mobile. */
const normalise = (raw: string) => { const t = raw.replace(/[\s\-()]/g, ''); return /^\d{10}$/.test(t) ? `+91${t}` : t }
const validPhone = (raw: string) => /^\+\d{8,15}$/.test(normalise(raw))

export default function QuickPrescriptionPage() {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [ageMode, setAgeMode] = useState<'age' | 'dob'>('age')
  const [age, setAge] = useState('')
  const [dob, setDob] = useState('')
  // People already on the books with this number (families share a phone), and which one this is.
  const [known, setKnown] = useState<KnownPatient[]>([])
  const [chosen, setChosen] = useState<string>('new')
  const [diagnosis, setDiagnosis] = useState('')
  const [medicines, setMedicines] = useState<Medicine[]>([emptyMedicine()])
  const [notes, setNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [today, setToday] = useState('')

  const [busy, setBusy] = useState<'save' | 'send' | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)
  const [share, setShare] = useState<Share>({ state: 'idle' })

  useEffect(() => {
    fetch('/api/public/config').then(r => r.json()).then(d => setToday(d.config?.today ?? '')).catch(() => {})
  }, [])

  // Look the number up as soon as it is complete, so a returning patient is picked, not typed again.
  useEffect(() => {
    const d = digits(phone)
    if (d.length < 10) { setKnown([]); setChosen('new'); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(d.slice(-10))}&limit=10`)
        if (!res.ok) return
        const list: KnownPatient[] = ((await res.json()).patients ?? []).filter((p: KnownPatient) => digits(p.phone).endsWith(d.slice(-10)))
        setKnown(list)
        setChosen(list.length === 1 ? list[0].id : 'new')
      } catch { /* the lookup is a convenience; the form works without it */ }
    }, 350)
    return () => clearTimeout(timer)
  }, [phone])

  const usingKnown = chosen !== 'new' ? known.find(p => p.id === chosen) : undefined
  const meds = medicines.filter(m => m.name.trim())
  const problem =
    !validPhone(phone) ? 'Enter the patient\'s mobile number.'
    : !usingKnown && name.trim().length < 2 ? 'Enter the patient\'s name.'
    : !usingKnown && ageMode === 'age' && (age === '' || Number(age) < 0 || Number(age) > 120) ? 'Enter the patient\'s age (or switch to date of birth).'
    : !usingKnown && ageMode === 'dob' && !dob ? 'Enter the patient\'s date of birth (or switch to age).'
    : meds.length === 0 ? 'Add at least one medicine.'
    : ''

  const send = async (prescriptionId: string) => {
    setShare({ state: 'sending' })
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/whatsapp`, { method: 'POST' })
      if (res.ok) { const d = await res.json().catch(() => ({})); setShare({ state: 'sent', message: `Sent to ${d.to ?? normalise(phone)}` }) }
      else setShare({ state: 'failed', message: await readFailure(res, 'Could not send on WhatsApp') })
    } catch {
      setShare({ state: 'failed', message: networkFailureText() })
    }
  }

  const submit = async (alsoSend: boolean) => {
    if (problem) { setError(problem); return }
    setError(''); setBusy(alsoSend ? 'send' : 'save'); setShare({ state: 'idle' })
    try {
      const res = await fetch('/api/doctor/quick-prescription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(usingKnown ? { patientId: usingKnown.id } : {
            patient: { name: name.trim(), phone: normalise(phone), ...(ageMode === 'age' ? { ageYears: Number(age) } : { dob }) },
          }),
          diagnosis: diagnosis.trim() || null,
          medicines: meds,
          notes: notes.trim() || null,
          followUpDate: followUpDate || null,
        }),
      })
      if (!res.ok) { setError(await readFailure(res, 'Could not save the prescription.')); return }
      const data = await res.json()
      const result: Saved = { appointmentId: data.appointmentId, prescriptionId: data.prescriptionId, patientName: usingKnown?.name ?? name.trim(), phone: usingKnown?.phone ?? normalise(phone) }
      setSaved(result)
      if (alsoSend) await send(result.prescriptionId)
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(null)
    }
  }

  const startAnother = () => {
    setPhone(''); setName(''); setAge(''); setDob(''); setKnown([]); setChosen('new')
    setDiagnosis(''); setMedicines([emptyMedicine()]); setNotes(''); setFollowUpDate('')
    setSaved(null); setShare({ state: 'idle' }); setError('')
  }

  if (saved) {
    const sending = share.state === 'sending'
    return (
      <div className="space-y-5 animate-fade-in max-w-2xl">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Quick prescription</h1>
        <div className="card p-5 space-y-4">
          <p className="flex items-center gap-2 font-semibold text-slate-800"><CheckCircle2 size={20} className="text-green-600" aria-hidden="true" /> Prescription saved for {saved.patientName}</p>
          {share.state === 'sending' && <Alert variant="info">Sending to {saved.phone} on WhatsApp…</Alert>}
          {share.state === 'sent' && <Alert variant="success">{share.message}. {saved.patientName} has the prescription on WhatsApp, on your clinic letterhead.</Alert>}
          {share.state === 'failed' && <Alert variant="error">{share.message} The prescription is saved. You can try again.</Alert>}
          <div className="flex flex-wrap gap-2">
            {share.state !== 'sent' && (
              <button type="button" onClick={() => send(saved.prescriptionId)} disabled={sending} className="btn disabled:opacity-60" style={{ backgroundColor: '#25D366', color: 'var(--color-on-whatsapp)' }}>
                <WhatsAppIcon size={16} /> {sending ? 'Sending...' : share.state === 'failed' ? 'Try again' : `Send on WhatsApp to ${saved.phone}`}
              </button>
            )}
            <a href={`/api/prescriptions/${saved.prescriptionId}/pdf`} download className="btn btn-outline"><Download size={16} aria-hidden="true" /> Download PDF</a>
            <Link href={`/doctor/appointments/${saved.appointmentId}`} className="btn btn-outline"><UserRound size={16} aria-hidden="true" /> Open visit</Link>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <Button variant="forest" onClick={startAnother}><FilePlus2 size={16} aria-hidden="true" /> New quick prescription</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Quick prescription</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-sage)' }}>For a consultation by phone or video. Add the patient, write the medicines, and send the prescription on WhatsApp on your clinic letterhead.</p>
      </div>

      <section className="card p-5 space-y-4" aria-labelledby="qp-patient">
        <h2 id="qp-patient" className="font-semibold text-slate-800">Patient</h2>
        <div className="form-group">
          <label htmlFor="qp-phone" className="form-label">Mobile number <span aria-hidden="true" className="text-red-600">*</span></label>
          <input id="qp-phone" className="form-input" inputMode="tel" autoComplete="off" placeholder="98765 43210" value={phone} onChange={e => setPhone(e.target.value)} aria-describedby="qp-phone-hint" />
          <p id="qp-phone-hint" className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>The prescription is sent to this WhatsApp number. Without a country code it is taken as +91.</p>
        </div>

        {known.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="form-label">Who is this?</legend>
            {known.map(p => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer" style={{ borderColor: chosen === p.id ? 'var(--color-forest)' : 'var(--color-sage-border)' }}>
                <input type="radio" name="qp-who" checked={chosen === p.id} onChange={() => setChosen(p.id)} />
                <span className="font-medium">{p.name}</span>
                {p.dob && <span className="text-xs" style={{ color: 'var(--color-sage)' }}>{computeAge(p.dob)} yrs</span>}
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer" style={{ borderColor: chosen === 'new' ? 'var(--color-forest)' : 'var(--color-sage-border)' }}>
              <input type="radio" name="qp-who" checked={chosen === 'new'} onChange={() => setChosen('new')} />
              <span className="font-medium">Someone else on this number</span>
            </label>
          </fieldset>
        )}

        {!usingKnown && (
          <>
            <div className="form-group">
              <label htmlFor="qp-name" className="form-label">Name <span aria-hidden="true" className="text-red-600">*</span></label>
              <input id="qp-name" className="form-input" autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={ageMode === 'age' ? 'qp-age' : 'qp-dob'} className="form-label">{ageMode === 'age' ? 'Age (years)' : 'Date of birth'} <span aria-hidden="true" className="text-red-600">*</span></label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAgeMode(m => m === 'age' ? 'dob' : 'age')}>{ageMode === 'age' ? 'Use date of birth' : 'Use age'}</button>
              </div>
              {ageMode === 'age'
                ? <input id="qp-age" className="form-input" type="number" inputMode="numeric" min={0} max={120} style={{ maxWidth: '8rem' }} value={age} onChange={e => setAge(e.target.value)} />
                : <input id="qp-dob" className="form-input" type="date" max={today || undefined} style={{ maxWidth: '12rem' }} value={dob} onChange={e => setDob(e.target.value)} />}
            </div>
          </>
        )}
      </section>

      <section className="card p-5 space-y-5" aria-labelledby="qp-rx">
        <h2 id="qp-rx" className="font-semibold text-slate-800">Prescription</h2>
        <div className="form-group">
          <label htmlFor="qp-diagnosis" className="form-label">Diagnosis <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span></label>
          <textarea id="qp-diagnosis" className="form-textarea" rows={2} placeholder="e.g. Upper respiratory tract infection" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
        </div>

        <MedicineList medicines={medicines} onChange={setMedicines} />

        <details className="group">
          <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--color-link)' }}>Follow-up date and notes (optional)</summary>
          <div className="space-y-4 mt-3">
            <div className="form-group">
              <label htmlFor="qp-follow" className="form-label">Follow-up visit</label>
              <input id="qp-follow" type="date" className="form-input" style={{ maxWidth: '12rem' }} min={today || undefined} value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Printed on the prescription. The patient also gets a WhatsApp reminder the day before.</p>
            </div>
            <div className="form-group">
              <label htmlFor="qp-notes" className="form-label">Additional notes</label>
              <textarea id="qp-notes" className="form-textarea" rows={2} placeholder="Diet, precautions, when to call..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </details>
      </section>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="space-y-2">
        <button type="button" onClick={() => submit(true)} disabled={busy !== null} className="btn btn-lg w-full disabled:opacity-60" style={{ backgroundColor: '#25D366', color: 'var(--color-on-whatsapp)' }}>
          <WhatsAppIcon size={18} /> {busy === 'send' ? 'Saving and sending...' : 'Save and send on WhatsApp'}
        </button>
        {validPhone(phone) && <p className="text-xs text-center" style={{ color: 'var(--color-sage)' }}>Will be sent to {normalise(phone)}</p>}
        <Button variant="outline" block loading={busy === 'save'} disabled={busy !== null} onClick={() => submit(false)}><Save size={16} aria-hidden="true" /> Save only</Button>
      </div>
    </div>
  )
}
