'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Clock, FileText, CreditCard,
  CheckCircle2, XCircle, Edit3, Save, Pill, Plus, Trash2,
  Download, Printer, Phone
} from 'lucide-react'
import { formatDate, computeAge } from '@/lib/slots'
import { format, parseISO } from 'date-fns'
import type { Medicine, TaperStep } from '@/lib/constants'
import { MAX_TAPER_STEPS, dayRangeLabel, taperSchedule, taperTotalDays } from '@/lib/taper'
import { PAYMENT_MODES } from '@/lib/constants'

interface Suggestion { name: string; dosage: string; frequency: string; duration: string; instructions?: string; taper?: Medicine['taper'] }
interface Patient {
  id: string; name: string; phone: string; dob: string; medicalHistory?: string; email?: string
}
interface Appointment {
  id: string; startTime: string; endTime: string; status: string;
  chiefComplaint?: string; consultationNotes?: string;
  patient: Patient;
  prescription?: { id: string; diagnosis?: string; medicines: Medicine[]; notes?: string; followUpDate?: string | null }
  payment?: { id: string; amount: string; mode: string; paidAt: string; notes?: string; receiptPdfPath?: string }
}

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'notes' | 'prescription' | 'payment'>('notes')

  // Notes state
  const [notes, setNotes] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Prescription state
  const [diagnosis, setDiagnosis] = useState('')
  const [medicines, setMedicines] = useState<Medicine[]>([{ name: '', dosage: '', frequency: '', duration: '' }])
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  // Medicines this clinic has prescribed before, offered as the doctor types.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savingRx, setSavingRx] = useState(false)

  // Payment state
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('CASH')
  const [payNotes, setPayNotes] = useState('')
  const [savingPay, setSavingPay] = useState(false)

  const [error, setError] = useState('')
  // Sending the prescription to the patient on WhatsApp
  const [share, setShare] = useState<{ state: 'idle' | 'confirm' | 'sending' | 'sent' | 'failed'; message?: string }>({ state: 'idle' })
  // "Print on letterhead": the paper in the printer already carries the clinic's letterhead.
  const [onLetterhead, setOnLetterheadState] = useState(false)
  useEffect(() => {
    try { setOnLetterheadState(localStorage.getItem('rx.onLetterhead') === '1') } catch { /* private mode */ }
  }, [])
  const setOnLetterhead = (v: boolean) => {
    setOnLetterheadState(v)
    try { localStorage.setItem('rx.onLetterhead', v ? '1' : '0') } catch { /* private mode */ }
  }
  // What is saved on the server, to tell when the form has edits the PDF would not include.
  const [savedRx, setSavedRx] = useState('')
  const [savedPay, setSavedPay] = useState('')

  const fetchAppt = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/appointments/${id}`)
      if (!res.ok) { setError('Could not load this appointment.'); return }
      const data = await res.json()
      setAppt(data.appointment)
      setNotes(data.appointment?.consultationNotes ?? '')
      if (data.appointment?.prescription) {
        const rx = data.appointment.prescription
        const meds = rx.medicines?.length ? rx.medicines : [{ name: '', dosage: '', frequency: '', duration: '' }]
        setDiagnosis(rx.diagnosis ?? '')
        setMedicines(meds)
        setPrescriptionNotes(rx.notes ?? '')
        setFollowUpDate(rx.followUpDate ?? '')
        setSavedRx(JSON.stringify([rx.diagnosis ?? '', meds.filter((m: Medicine) => m.name), rx.notes ?? '', rx.followUpDate ?? '']))
      }
      if (data.appointment?.payment) {
        const pay = data.appointment.payment
        setPayAmount(pay.amount?.toString() ?? '')
        setPayMode(pay.mode ?? 'CASH')
        setPayNotes(pay.notes ?? '')
        setSavedPay(JSON.stringify([String(pay.amount ?? ''), pay.mode ?? 'CASH', pay.notes ?? '']))
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchAppt() }, [fetchAppt])

  // A write that failed must say so; silently carrying on made it look saved.
  const write = async (url: string, method: string, body: unknown, failure: string) => {
    setError('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? failure)
      return false
    }
    return true
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      if (await write(`/api/appointments/${id}`, 'PATCH', { consultationNotes: notes }, 'Could not save the notes.')) {
        setEditingNotes(false)
        fetchAppt()
      }
    } finally {
      setSavingNotes(false)
    }
  }

  const markCompleted = async () => {
    if (await write(`/api/appointments/${id}`, 'PATCH', { status: 'COMPLETED' }, 'Could not mark this appointment as done.')) fetchAppt()
  }

  const savePrescription = async () => {
    if (!appt) return
    setSavingRx(true)
    try {
      const ok = await write('/api/prescriptions', 'POST', {
        appointmentId: appt.id,
        patientId: appt.patient.id,
        diagnosis,
        medicines: medicines.filter(m => m.name),
        notes: prescriptionNotes,
        followUpDate: followUpDate || null,
      }, 'Could not save the prescription.')
      if (ok) { setShare({ state: 'idle' }); fetchAppt() }
    } finally {
      setSavingRx(false)
    }
  }

  const savePayment = async () => {
    if (!appt) return
    setSavingPay(true)
    try {
      const ok = await write('/api/payments', 'POST', {
        appointmentId: appt.id,
        patientId: appt.patient.id,
        amount: parseFloat(payAmount),
        mode: payMode,
        notes: payNotes,
      }, 'Could not save the payment.')
      if (ok) fetchAppt()
    } finally {
      setSavingPay(false)
    }
  }

  const shareOnWhatsApp = async () => {
    if (!appt?.prescription) return
    setShare({ state: 'sending' })
    try {
      const res = await fetch(`/api/prescriptions/${appt.prescription.id}/whatsapp`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setShare({ state: 'sent', message: `Sent to ${data.to ?? appt.patient.phone}` })
      else setShare({ state: 'failed', message: data.error ?? 'Could not send on WhatsApp' })
    } catch {
      setShare({ state: 'failed', message: 'Could not reach the server. Check your connection and try again.' })
    }
  }

  const addMedicine = () => setMedicines(prev => [...prev, { name: '', dosage: '', frequency: '', duration: '' }])
  const toggleTaper = (i: number, on: boolean) => setMedicines(prev => prev.map((m, idx) => {
    if (idx !== i) return m
    if (!on) {
      const { taper, ...rest } = m
      return { ...rest, dosage: taper?.steps[0]?.dose ?? '', frequency: '', duration: '' }
    }
    // Seed the first step from whatever was already typed for a fixed dose.
    return { ...m, taper: { steps: [{ dose: m.dosage, frequency: m.frequency === 'Tapering' ? '' : m.frequency, days: parseInt(m.duration) || 5 }] } }
  }))
  const setSteps = (i: number, fn: (steps: TaperStep[]) => TaperStep[]) =>
    setMedicines(prev => prev.map((m, idx) => idx === i && m.taper ? { ...m, taper: { steps: fn(m.taper.steps) } } : m))
  const updateStep = (i: number, j: number, patch: Partial<TaperStep>) => setSteps(i, steps => steps.map((st, k) => k === j ? { ...st, ...patch } : st))
  const addStep = (i: number) => setSteps(i, steps => steps.length >= MAX_TAPER_STEPS ? steps : [...steps, { dose: '', frequency: steps[steps.length - 1]?.frequency ?? '', days: steps[steps.length - 1]?.days ?? 5 }])
  const removeStep = (i: number, j: number) => setSteps(i, steps => steps.length > 1 ? steps.filter((_, k) => k !== j) : steps)
  const removeMedicine = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i))
  const askForSuggestions = (text: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (text.trim().length < 2) { setSuggestions([]); return }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/prescriptions/medicines?q=${encodeURIComponent(text.trim())}`)
        if (res.ok) setSuggestions((await res.json()).medicines ?? [])
      } catch { /* suggestions are a convenience; typing carries on without them */ }
    }, 250)
  }

  // Picking a remembered medicine from the list fills in how it was prescribed last time (blank fields only).
  const onNameChange = (i: number, value: string) => {
    askForSuggestions(value)
    const hit = suggestions.find(s => s.name.toLowerCase() === value.trim().toLowerCase())
    setMedicines(prev => prev.map((m, idx) => {
      if (idx !== i) return m
      const next = { ...m, name: value }
      const untouched = !m.dosage && !m.frequency && !m.duration && !m.taper
      if (hit && untouched) {
        next.dosage = hit.dosage; next.frequency = hit.frequency; next.duration = hit.duration
        if (hit.instructions) next.instructions = hit.instructions
        if (hit.taper) next.taper = hit.taper
      }
      return next
    }))
  }

  const updateMedicine = (i: number, field: keyof Medicine, value: string) => {
    setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    )
  }

  if (!appt) {
    return <div className="text-center py-20 text-slate-500">Appointment not found</div>
  }

  const age = computeAge(appt.patient.dob)
  const rxDirty = JSON.stringify([diagnosis, medicines.filter(m => m.name), prescriptionNotes, followUpDate]) !== savedRx
  const addDays = (n: number) => { const d = new Date(appt.startTime); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const sharing = share.state === 'sending'
  const payDirty = JSON.stringify([payAmount, payMode, payNotes]) !== savedPay
  const tabs = [
    { key: 'notes', label: 'Consultation Notes', icon: FileText },
    { key: 'prescription', label: 'Prescription', icon: Pill },
    { key: 'payment', label: 'Payment', icon: CreditCard },
  ] as const

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn btn-ghost p-2 -ml-2">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{appt.patient.name}</h1>
            <p className="text-sm text-slate-500">{age} yrs · {appt.patient.phone} · {formatDate(appt.startTime)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${
            appt.status === 'BOOKED' ? 'badge-blue' :
            appt.status === 'COMPLETED' ? 'badge-green' : 'badge-red'
          }`}>{appt.status}</span>
          {appt.status === 'BOOKED' && (
            <button onClick={markCompleted} className="btn btn-success btn-sm">
              <CheckCircle2 size={14} /> Done
            </button>
          )}
        </div>
      </div>

      {/* Patient Info Card */}
      <div className="card p-4 flex flex-wrap gap-4 text-sm">
        <div><span className="text-slate-500">Chief Complaint:</span> <span className="font-medium">{appt.chiefComplaint ?? '—'}</span></div>
        {appt.patient.medicalHistory && (
          <div className="w-full"><span className="text-slate-500">Medical History:</span> <span className="text-slate-700">{appt.patient.medicalHistory}</span></div>
        )}
        {appt.patient.phone && (
          <a href={`tel:${appt.patient.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
            <Phone size={14} /> {appt.patient.phone}
          </a>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <datalist id="medicine-suggestions">
        {suggestions.map(s => <option key={s.name} value={s.name} />)}
      </datalist>

      {/* Tab Panels */}
      {activeTab === 'notes' && (
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Consultation Notes</h3>
            {!editingNotes ? (
              <button onClick={() => setEditingNotes(true)} className="btn btn-ghost btn-sm">
                <Edit3 size={14} /> Edit
              </button>
            ) : (
              <button onClick={saveNotes} className="btn btn-primary btn-sm" disabled={savingNotes}>
                <Save size={14} /> {savingNotes ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
          {editingNotes ? (
            <textarea aria-label="Consultation notes"
              className="form-textarea min-h-[200px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Enter consultation notes, findings, diagnosis summary..."
              autoFocus
            />
          ) : (
            <div className="min-h-[100px] text-slate-700 whitespace-pre-wrap">
              {notes || <span className="text-slate-500 italic">No notes yet. Click Edit to add.</span>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'prescription' && (
        <div className="card p-5 space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Prescription</h3>
            {appt.prescription && (
              <div className="flex gap-2">
                <DocLink href={`/api/prescriptions/${appt.prescription.id}/pdf`} disabled={rxDirty} download>
                  <Download size={14} /> Download PDF
                </DocLink>
                <DocLink href={`/api/prescriptions/${appt.prescription.id}/pdf?inline=1${onLetterhead ? '&mode=preprinted' : ''}`} disabled={rxDirty}>
                  <Printer size={14} /> Print
                </DocLink>
                <button
                  type="button" onClick={() => setShare({ state: 'confirm' })} disabled={rxDirty || sharing || !appt.patient.phone}
                  className="btn btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#25D366', color: 'var(--color-on-whatsapp)' }}
                  aria-label="Share prescription on WhatsApp"
                >
                  <WhatsAppIcon size={15} /> {sharing ? 'Sending...' : 'WhatsApp'}
                </button>
              </div>
            )}
          </div>
          {!appt.patient.phone && appt.prescription && (
            <p className="text-xs text-amber-700 -mt-2">This patient has no phone number on file, so the prescription cannot be sent on WhatsApp.</p>
          )}
          {(share.state === 'confirm' || sharing) && (
            <div role="alertdialog" aria-label="Send on WhatsApp" className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3 -mt-2">
              <p className="text-sm text-slate-700">
                Send this prescription as a PDF to <strong>{appt.patient.name}</strong> on WhatsApp (<strong>{appt.patient.phone}</strong>)?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={shareOnWhatsApp} disabled={sharing} className="btn btn-sm disabled:opacity-60" style={{ backgroundColor: '#25D366', color: 'var(--color-on-whatsapp)' }}>
                  <WhatsAppIcon size={15} /> {sharing ? 'Sending...' : 'Send now'}
                </button>
                <button type="button" onClick={() => setShare({ state: 'idle' })} disabled={sharing} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </div>
          )}
          {share.state === 'sent' && <p role="status" className="text-sm text-green-700 -mt-2">{share.message}. The patient has the PDF on WhatsApp.</p>}
          {share.state === 'failed' && <p role="alert" className="text-sm text-red-600 -mt-2">{share.message}</p>}
          {appt.prescription && (
            <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer select-none -mt-2">
              <input type="checkbox" className="mt-0.5" checked={onLetterhead} onChange={e => setOnLetterhead(e.target.checked)} />
              <span>
                Print on letterhead
                <span className="block text-xs text-slate-500">Tick when the paper already has your letterhead printed on it. Adjust the spacing in Settings.</span>
              </span>
            </label>
          )}
          {appt.prescription && rxDirty && (
            <p className="text-xs text-amber-700 -mt-2">You have unsaved changes. Save the prescription to download or print the latest version.</p>
          )}

          <div className="form-group">
            <label htmlFor="diagnosis" className="form-label">Diagnosis</label>
            <textarea id="diagnosis"
              className="form-textarea"
              value={diagnosis}
              onChange={e => setDiagnosis(e.target.value)}
              placeholder="e.g. Upper respiratory tract infection"
              rows={2}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="form-label mb-0">Medicines</label>
              <button onClick={addMedicine} className="btn btn-ghost btn-sm text-blue-600">
                <Plus size={14} /> Add Medicine
              </button>
            </div>

            <div className="space-y-3">
              {medicines.map((med, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Medicine {i + 1}</span>
                    {medicines.length > 1 && (
                      <button onClick={() => removeMedicine(i)} className="text-red-600 hover:text-red-700 p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input aria-label={`Medicine ${i + 1} name`}
                        className="form-input"
                        placeholder="Medicine name"
                        value={med.name}
                        list="medicine-suggestions"
                        autoComplete="off"
                        onChange={e => onNameChange(i, e.target.value)}
                      />
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                      <input type="checkbox" checked={!!med.taper} onChange={e => toggleTaper(i, e.target.checked)} />
                      Tapering dose (the dose changes over the course)
                    </label>
                    {med.taper ? (
                      <div className="col-span-2 space-y-2">
                        {taperSchedule(med.taper.steps).map((line, j) => (
                          <div key={j} className="grid grid-cols-12 gap-2 items-center">
                            <span className="col-span-12 sm:col-span-2 text-xs font-medium text-slate-500">{dayRangeLabel(line)}</span>
                            <input className="form-input col-span-5 sm:col-span-3" placeholder="Dose (e.g. 40 mg)" value={med.taper!.steps[j].dose} onChange={e => updateStep(i, j, { dose: e.target.value })} aria-label={`Step ${j + 1} dose`} />
                            <input className="form-input col-span-5 sm:col-span-4" placeholder="How often" value={med.taper!.steps[j].frequency} onChange={e => updateStep(i, j, { frequency: e.target.value })} aria-label={`Step ${j + 1} frequency`} />
                            <input type="number" min={1} max={365} className="form-input col-span-2 sm:col-span-2" placeholder="Days" value={med.taper!.steps[j].days} onChange={e => updateStep(i, j, { days: Math.max(1, parseInt(e.target.value) || 1) })} aria-label={`Step ${j + 1} days`} />
                            <button type="button" onClick={() => removeStep(i, j)} disabled={med.taper!.steps.length === 1} className="col-span-12 sm:col-span-1 text-red-600 hover:text-red-700 disabled:opacity-30 justify-self-end" aria-label={`Remove step ${j + 1}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => addStep(i)} disabled={med.taper.steps.length >= MAX_TAPER_STEPS} className="btn btn-ghost btn-sm text-blue-600"><Plus size={14} /> Add step</button>
                          <span className="text-xs text-slate-500">Total {taperTotalDays(med.taper.steps)} days</span>
                        </div>
                        <input aria-label={`Medicine ${i + 1} instructions`} className="form-input" placeholder="Instructions (optional)" value={med.instructions ?? ''} onChange={e => updateMedicine(i, 'instructions', e.target.value)} />
                      </div>
                    ) : (
                      <>
                        <input aria-label={`Medicine ${i + 1} dosage`} className="form-input" placeholder="Dosage (e.g. 500mg)" value={med.dosage} onChange={e => updateMedicine(i, 'dosage', e.target.value)} />
                        <input aria-label={`Medicine ${i + 1} frequency`} className="form-input" placeholder="Frequency (e.g. 3x daily)" value={med.frequency} onChange={e => updateMedicine(i, 'frequency', e.target.value)} />
                        <input aria-label={`Medicine ${i + 1} duration`} className="form-input" placeholder="Duration (e.g. 5 days)" value={med.duration} onChange={e => updateMedicine(i, 'duration', e.target.value)} />
                        <input aria-label={`Medicine ${i + 1} instructions`} className="form-input" placeholder="Instructions (optional)" value={med.instructions ?? ''} onChange={e => updateMedicine(i, 'instructions', e.target.value)} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="followUpDate">Follow-up visit (optional)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id="followUpDate" type="date" className="form-input" style={{ maxWidth: '12rem' }} value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
              {([['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['1 month', 30]] as const).map(([label, n]) => (
                <button key={label} type="button" className="btn btn-ghost btn-sm" onClick={() => setFollowUpDate(addDays(n))}>{label}</button>
              ))}
              {followUpDate && <button type="button" className="btn btn-ghost btn-sm text-red-500" onClick={() => setFollowUpDate('')}>Clear</button>}
            </div>
            <p className="text-xs text-slate-500 mt-1">Printed on the prescription. The patient also gets a WhatsApp reminder the day before.</p>
          </div>

          <div className="form-group">
            <label htmlFor="additional-notes" className="form-label">Additional Notes</label>
            <textarea id="additional-notes"
              className="form-textarea"
              value={prescriptionNotes}
              onChange={e => setPrescriptionNotes(e.target.value)}
              placeholder="Diet restrictions, follow-up instructions..."
              rows={2}
            />
          </div>

          <button onClick={savePrescription} className="btn btn-primary w-full" disabled={savingRx}>
            <Save size={16} /> {savingRx ? 'Saving...' : 'Save Prescription'}
          </button>
        </div>
      )}

      {activeTab === 'payment' && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">Record Payment</h3>

          {appt.payment && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                <CheckCircle2 size={16} /> Payment Recorded
              </div>
              <div className="text-sm space-y-1 text-green-800">
                <p>Amount: <strong>₹{appt.payment.amount}</strong></p>
                <p>Mode: <strong>{appt.payment.mode}</strong></p>
                <p>Date: <strong>{format(parseISO(appt.payment.paidAt), 'dd MMM yyyy, hh:mm a')}</strong></p>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="amount" className="form-label">Amount (₹)</label>
            <input id="amount" type="number" className="form-input" placeholder="500" value={payAmount} onChange={e => setPayAmount(e.target.value)} min="0" step="0.01" />
          </div>

          <div className="form-group">
            <label htmlFor="payment-mode" className="form-label">Payment Mode</label>
            <select id="payment-mode" className="form-select" value={payMode} onChange={e => setPayMode(e.target.value)}>
              {PAYMENT_MODES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="notes" className="form-label">Notes (optional)</label>
            <input id="notes" className="form-input" placeholder="Any payment notes..." value={payNotes} onChange={e => setPayNotes(e.target.value)} />
          </div>

          <button onClick={savePayment} className="btn btn-primary w-full" disabled={savingPay || !payAmount}>
            <Save size={16} /> {savingPay ? 'Saving...' : appt.payment ? 'Update Payment' : 'Record Payment'}
          </button>

          {appt.payment && (
            <div className="flex gap-2">
              <DocLink href={`/api/payments/${appt.payment.id}/pdf`} disabled={payDirty} download className="flex-1 justify-center">
                <Download size={16} /> Download receipt
              </DocLink>
              <DocLink href={`/api/payments/${appt.payment.id}/pdf?inline=1`} disabled={payDirty} className="flex-1 justify-center">
                <Printer size={16} /> Print
              </DocLink>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// A PDF link styled as a button. Opens through the server, which builds the file from what is saved.
function DocLink({ href, disabled, download, className = '', children }: {
  href: string; disabled?: boolean; download?: boolean; className?: string; children: React.ReactNode
}) {
  const base = `btn btn-outline btn-sm ${className}`
  if (disabled) return <span className={`${base} opacity-50 cursor-not-allowed`} aria-disabled="true">{children}</span>
  return download
    ? <a href={href} download className={base}>{children}</a>
    : <a href={href} target="_blank" rel="noopener" className={base}>{children}</a>
}

// The WhatsApp mark (speech bubble with a handset), drawn in the current text colour.
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
