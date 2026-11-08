'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, Eye, FilePlus2, UserRound } from 'lucide-react'
import { ageDobPayload } from '@/components/ui/AgeDobFields'
import { PatientEntryFields, usePatientEntry, type KnownPatient } from '@/components/doctor/PatientEntry'
import { emptyRx, rxHasContent, rxToPayload, type RxContent } from '@/lib/rxContent'
import { PrescriptionFields } from '@/components/doctor/PrescriptionFields'
import { SaveShareBar, type ShareState } from '@/components/doctor/SaveShareBar'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'
import { readFailure, networkFailureText } from '@/lib/clientErrors'

type Share = ShareState
interface Saved { appointmentId: string; prescriptionId: string; patientName: string; phone: string }

const digits = (s: string) => s.replace(/D/g, '')

export default function QuickPrescriptionPage() {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10))
  const entry = usePatientEntry(today)
  const { code, number, name, ageDob, gender, chosen, phone, phoneOk, genderLocked } = entry
  const choose = entry.choose

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

  const problem =
    entry.problem
    || (!rxHasContent(rx) ? 'Add a medicine, some advice or a diagnosis.' : '')

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
          ...(chosen ? { patientId: chosen.id, ...(gender && !genderLocked ? { gender } : {}) } : {
            patient: { name: name.trim(), phone, ...ageDobPayload(ageDob), gender },
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
    entry.reset()
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
            <a href={`/api/prescriptions/${saved.prescriptionId}/pdf?inline=1`} target="_blank" rel="noopener noreferrer" className="btn btn-outline"><Eye size={16} aria-hidden="true" /> Preview</a>
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
        <PatientEntryFields entry={entry} idPrefix="qp" numberHint="The prescription is sent to this WhatsApp number." />
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

