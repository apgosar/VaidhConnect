'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, FilePlus2, Lock, UserRound, X } from 'lucide-react'
import { ageFromDob, dobFromAge } from '@/lib/time'
import { emptyRx, rxToPayload, type RxContent } from '@/lib/rxContent'
import { PrescriptionFields } from '@/components/doctor/PrescriptionFields'
import { SaveShareBar, type ShareState } from '@/components/doctor/SaveShareBar'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SuggestInput, type Suggestion } from '@/components/ui/SuggestInput'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'
import { readFailure, networkFailureText } from '@/lib/clientErrors'

interface KnownPatient { id: string; name: string; phone: string; dob?: string }
type Share = ShareState
interface Saved { appointmentId: string; prescriptionId: string; patientName: string; phone: string }

const DEFAULT_CODE = '+91'
const digits = (s: string) => s.replace(/\D/g, '')
// Country calling codes people are likely to have, so a pasted "+971501234567" is split as +971 / 501234567.
const COUNTRY_CODES = new Set([
  '1', '7', '20', '27', '31', '32', '33', '34', '39', '41', '44', '45', '46', '47', '49', '52', '54', '55', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '234', '254', '255', '256', '880', '960', '961', '962', '963', '964',
  '965', '966', '967', '968', '971', '972', '973', '974', '975', '976', '977', '994', '995',
])
/** "+919800000001" → { code: "+91", number: "9800000001" }. Without a "+", the digits are the number and the code stays +91. */
function splitPhone(raw: string): { code: string; number: string } {
  const d = digits(raw)
  if (raw.trim().startsWith('+')) {
    for (const n of [3, 2, 1]) if (COUNTRY_CODES.has(d.slice(0, n)) && d.length - n >= 6) return { code: `+${d.slice(0, n)}`, number: d.slice(n) }
    if (d.length > 10) return { code: `+${d.slice(0, -10)}`, number: d.slice(-10) }
  }
  return { code: DEFAULT_CODE, number: d.length > 10 && d.startsWith('91') ? d.slice(-10) : d }
}
const ageOf = (dob?: string, today?: string) => (dob && today ? ageFromDob(dob.slice(0, 10), today) : undefined)

export default function QuickPrescriptionPage() {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10))
  const [code, setCode] = useState(DEFAULT_CODE)
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [dob, setDob] = useState('')
  // Whichever of the two the doctor typed last is the one that is sent; the other is worked out from it.
  const [entered, setEntered] = useState<'age' | 'dob'>('age')
  // An existing patient picked from the dropdown: their details are filled in and locked.
  const [chosen, setChosen] = useState<KnownPatient | null>(null)

  const [searchFor, setSearchFor] = useState<{ source: 'name' | 'phone'; q: string } | null>(null)
  const [hits, setHits] = useState<KnownPatient[]>([])

  const [rx, setRx] = useState<RxContent>(emptyRx)

  const [busy, setBusy] = useState<'save' | 'send' | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)
  const [share, setShare] = useState<Share>({ state: 'idle' })

  useEffect(() => {
    fetch('/api/public/config').then(r => r.json()).then(d => { if (d.config?.today) setToday(d.config.today) }).catch(() => {})
  }, [])

  // Opened from a patient's page (?patient=<id>&phone=<number>): that patient is already picked, no typing at all.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('patient'); const phone = digits(params.get('phone') ?? '').slice(-10)
    if (!id || phone.length < 3) return
    fetch(`/api/patients/search?q=${encodeURIComponent(phone)}&limit=20`)
      .then(r => (r.ok ? r.json() : { patients: [] }))
      .then(d => { const p = (d.patients ?? []).find((x: KnownPatient) => x.id === id); if (p) choose(p) })
      .catch(() => { /* the form still works by typing */ })
    // runs once, on arrival
  }, [])

  // Search the clinic's patients while the doctor types a name or a number.
  useEffect(() => {
    if (!searchFor || chosen) { setHits([]); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchFor.q)}&limit=8`, { signal: controller.signal })
        if (res.ok) setHits((await res.json()).patients ?? [])
      } catch { /* searching is a convenience; the form works without it */ }
    }, 150)
    return () => { clearTimeout(timer); controller.abort() }
  }, [searchFor, chosen])

  const typeName = (v: string) => {
    setName(v)
    setSearchFor(v.trim().length >= 2 ? { source: 'name', q: v.trim() } : null)
  }
  const typeNumber = (raw: string) => {
    if (raw.trim().startsWith('+')) { const p = splitPhone(raw); setCode(p.code); setNumber(p.number) }
    else setNumber(digits(raw).slice(0, 14))
    const d = digits(raw).slice(-10)
    setSearchFor(d.length >= 3 ? { source: 'phone', q: d } : null)
  }
  const typeAge = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 3)
    setAge(clean); setEntered('age')
    setDob(clean !== '' && Number(clean) <= 120 ? dobFromAge(Number(clean), today) : '')
  }
  const typeDob = (v: string) => {
    setDob(v); setEntered('dob')
    setAge(v ? String(Math.max(0, ageFromDob(v, today))) : '')
  }

  const choose = (p: KnownPatient) => {
    const phone = splitPhone(p.phone)
    setChosen(p); setName(p.name); setCode(phone.code); setNumber(phone.number)
    const ymd = p.dob?.slice(0, 10) ?? ''
    setDob(ymd); setAge(ymd ? String(ageFromDob(ymd, today)) : ''); setEntered('dob')
    setSearchFor(null); setHits([])
  }
  const pick = (id: string) => {
    const p = hits.find(h => h.id === id)
    if (p) choose(p)
  }
  const clearChosen = () => {
    setChosen(null); setName(''); setNumber(''); setAge(''); setDob(''); setSearchFor(null); setHits([])
  }

  const phone = `${code}${number}`
  const phoneOk = /^\+\d{1,4}$/.test(code) && /^\+\d{8,15}$/.test(phone)
  const meds = rx.medicines.filter(m => m.name.trim())
  const ageOk = age !== '' && Number(age) >= 0 && Number(age) <= 120
  const problem =
    !phoneOk ? 'Enter the patient\'s mobile number.'
    : !chosen && name.trim().length < 2 ? 'Enter the patient\'s name.'
    : !chosen && entered === 'age' && !ageOk ? 'Enter the patient\'s age or date of birth.'
    : !chosen && entered === 'dob' && !dob ? 'Enter the patient\'s age or date of birth.'
    : meds.length === 0 ? 'Add at least one medicine.'
    : ''

  const nameSuggestions: Suggestion[] = searchFor?.source === 'name' && !chosen ? hits.map(h => toSuggestion(h, today)) : []
  const phoneSuggestions: Suggestion[] = searchFor?.source === 'phone' && !chosen ? hits.map(h => toSuggestion(h, today)) : []

  const send = async (prescriptionId: string) => {
    setShare({ state: 'sending' })
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/whatsapp`, { method: 'POST' })
      if (res.ok) { const d = await res.json().catch(() => ({})); setShare({ state: 'sent', message: `Sent to ${d.to ?? phone}` }) }
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
          ...(chosen ? { patientId: chosen.id } : {
            patient: { name: name.trim(), phone, ...(entered === 'age' ? { ageYears: Number(age) } : { dob }) },
          }),
          ...rxToPayload(rx),
        }),
      })
      if (!res.ok) { setError(await readFailure(res, 'Could not save the prescription.')); return }
      const data = await res.json()
      const result: Saved = { appointmentId: data.appointmentId, prescriptionId: data.prescriptionId, patientName: chosen?.name ?? name.trim(), phone: chosen?.phone ?? phone }
      setSaved(result)
      if (alsoSend) await send(result.prescriptionId)
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(null)
    }
  }

  const startAnother = () => {
    setCode(DEFAULT_CODE); setNumber(''); setName(''); setAge(''); setDob(''); setEntered('age'); setChosen(null); setSearchFor(null); setHits([])
    setRx(emptyRx())
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
        <p className="text-xs -mt-2" style={{ color: 'var(--color-sage)' }}>Start typing a name or a mobile number to pick a patient you already have.</p>

        {chosen && (
          <div className="flex items-center justify-between gap-2 rounded-lg p-3" style={{ background: 'var(--color-primary-bg)' }}>
            <p className="text-sm flex items-start gap-2"><Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>Existing patient.</strong> Their details are filled in and locked. To enter someone else, press &ldquo;Not them&rdquo;.</span></p>
            <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={clearChosen}><X size={14} aria-hidden="true" /> Not them</button>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="qp-number" className="form-label">Mobile number {chosen ? <LockMark /> : <span aria-hidden="true" className="text-red-600">*</span>}</label>
          <div className="flex gap-2">
            <input aria-label="Country code" className="form-input text-center" style={{ width: '5rem', flexShrink: 0 }} inputMode="tel" value={code} disabled={!!chosen}
              onChange={e => setCode(`+${digits(e.target.value).slice(0, 4)}`)} />
            <div className="flex-1 min-w-0">
              <SuggestInput id="qp-number" className="form-input" type="tel" inputMode="tel" placeholder="98765 43210" value={number} disabled={!!chosen}
                aria-describedby="qp-number-hint" onChange={e => typeNumber(e.target.value)}
                suggestions={phoneSuggestions} onPick={pick} listLabel="Matching patients" />
            </div>
          </div>
          <p id="qp-number-hint" className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>The prescription is sent to this WhatsApp number.</p>
        </div>

        <div className="form-group">
          <label htmlFor="qp-name" className="form-label">Name {chosen ? <LockMark /> : <span aria-hidden="true" className="text-red-600">*</span>}</label>
          <SuggestInput id="qp-name" className="form-input" value={name} disabled={!!chosen} onChange={e => typeName(e.target.value)}
            suggestions={nameSuggestions} onPick={pick} listLabel="Matching patients" />
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0, 6.5rem) minmax(0, 1fr)' }}>
          <div className="form-group">
            <label htmlFor="qp-age" className="form-label">Age {chosen ? <LockMark /> : <span aria-hidden="true" className="text-red-600">*</span>}</label>
            <input id="qp-age" className="form-input" inputMode="numeric" placeholder="Years" value={age} disabled={!!chosen} onChange={e => typeAge(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="qp-dob" className="form-label">Date of birth {chosen ? <LockMark /> : <span aria-hidden="true" className="text-red-600">*</span>}</label>
            <input id="qp-dob" className="form-input" type="date" max={today} value={dob} disabled={!!chosen} onChange={e => typeDob(e.target.value)} />
          </div>
        </div>
        {!chosen && <p className="text-xs -mt-2" style={{ color: 'var(--color-sage)' }}>Enter either one. The other is worked out for you{entered === 'age' && dob ? ' (the date of birth is an estimate from the age)' : ''}.</p>}
      </section>

      <section className="card p-5 space-y-5" aria-labelledby="qp-rx">
        <h2 id="qp-rx" className="font-semibold text-slate-800">Prescription</h2>
        <PrescriptionFields value={rx} onChange={patch => setRx(prev => ({ ...prev, ...patch }))} baseDate={today} />
      </section>

      <SaveShareBar
        busy={busy}
        canShare={phoneOk}
        sendTo={phone}
        problem={error}
        onSaveAndShare={() => submit(true)}
        onSave={() => submit(false)}
      />
    </div>
  )
}

/** Next to a field's label when the field is locked because an existing patient was picked. */
function LockMark() {
  return <Lock size={12} className="inline -mt-0.5" aria-label="locked" role="img" />
}

function toSuggestion(p: KnownPatient, today: string): Suggestion {
  const years = ageOf(p.dob, today)
  return { key: p.id, primary: p.name, secondary: `${p.phone}${years !== undefined ? ` · ${years} yrs` : ''}` }
}
