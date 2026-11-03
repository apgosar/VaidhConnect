'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, CreditCard,
  CheckCircle2, Edit3, Save, Pill,
  Download, Printer, Phone, CalendarClock
} from 'lucide-react'
import { formatDate, computeAge } from '@/lib/slots'
import { format, parseISO } from 'date-fns'
import { PrescriptionFields } from '@/components/doctor/PrescriptionFields'
import { SaveShareBar, type ShareState } from '@/components/doctor/SaveShareBar'
import { HandwrittenRx } from '@/components/doctor/HandwrittenRx'
import { PAYMENT_MODES } from '@/lib/constants'
import { emptyRx, rxFromStored, rxSnapshot, rxToPayload, type RxContent } from '@/lib/rxContent'
import { readFailure, networkFailureText } from '@/lib/clientErrors'
import { LangText } from '@/components/ui/LangText'
import { RescheduleDialog } from '@/components/booking/RescheduleDialog'

interface Patient {
  id: string; name: string; phone: string; dob: string; medicalHistory?: string; email?: string
}
interface Appointment {
  id: string; startTime: string; endTime: string; status: string; visitType?: string;
  chiefComplaint?: string; consultationNotes?: string;
  patient: Patient;
  prescription?: { id: string }
  payment?: { id: string; amount: string; mode: string; paidAt: string; notes?: string; receiptPdfPath?: string }
}

type Tab = 'notes' | 'prescription' | 'payment'
const TABS: Tab[] = ['notes', 'prescription', 'payment']

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('notes')

  // Notes state
  const [notes, setNotes] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Prescription state: what is in the form, and a snapshot of what is saved to tell when they differ
  const [rx, setRx] = useState<RxContent>(emptyRx)
  const [savedRx, setSavedRx] = useState('')
  const [rxBusy, setRxBusy] = useState<'save' | 'send' | null>(null)
  const [rxProblem, setRxProblem] = useState('')
  // Sending the prescription to the patient on WhatsApp
  const [share, setShare] = useState<ShareState>({ state: 'idle' })
  // "Print on letterhead": the paper in the printer already carries the clinic's letterhead.
  const [onLetterhead, setOnLetterheadState] = useState(false)
  useEffect(() => {
    try { setOnLetterheadState(localStorage.getItem('rx.onLetterhead') === '1') } catch { /* private mode */ }
  }, [])
  const setOnLetterhead = (v: boolean) => {
    setOnLetterheadState(v)
    try { localStorage.setItem('rx.onLetterhead', v ? '1' : '0') } catch { /* private mode */ }
  }

  // Payment state
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('CASH')
  const [payNotes, setPayNotes] = useState('')
  const [savingPay, setSavingPay] = useState(false)
  const [savedPay, setSavedPay] = useState('')

  const [error, setError] = useState('')
  const [rescheduling, setRescheduling] = useState(false)

  // A link from a list can open straight on the prescription: /doctor/appointments/<id>?tab=prescription
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (TABS.includes(wanted as Tab)) setActiveTab(wanted as Tab)
  }, [])

  // `quiet` refreshes in place, without replacing the page with a spinner (the form keeps its scroll position).
  const fetchAppt = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const res = await fetch(`/api/appointments/${id}`)
      if (!res.ok) { setError('Could not load this appointment.'); return }
      const data = await res.json()
      const a = data.appointment
      setAppt(a)
      setNotes(a?.consultationNotes ?? '')
      // The complaint belongs to the visit (the patient may have given it when booking), so it is there before a prescription exists.
      const stored = rxFromStored(a?.prescription, a?.chiefComplaint)
      setRx(stored)
      setSavedRx(a?.prescription ? rxSnapshot(stored) : '')
      if (a?.payment) {
        const pay = a.payment
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
        fetchAppt(true)
      }
    } finally {
      setSavingNotes(false)
    }
  }

  const markCompleted = async () => {
    if (await write(`/api/appointments/${id}`, 'PATCH', { status: 'COMPLETED' }, 'Could not mark this appointment as done.')) fetchAppt(true)
  }

  const phoneOk = !!appt && /^\+\d{8,15}$/.test(appt.patient.phone)

  /** Saves the form. Returns the prescription's id, or null after showing what went wrong. */
  const persist = async (): Promise<string | null> => {
    if (!appt) return null
    if (!rx.medicines.some(m => m.name.trim())) { setRxProblem('Add at least one medicine.'); return null }
    const res = await fetch('/api/prescriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: appt.id, patientId: appt.patient.id, ...rxToPayload(rx) }),
    })
    if (!res.ok) { setRxProblem(await readFailure(res, 'Could not save the prescription.')); return null }
    const body = await res.json()
    return body.prescription?.id ?? null
  }

  const submitRx = async (alsoSend: boolean) => {
    setRxProblem(''); setShare({ state: 'idle' }); setRxBusy(alsoSend ? 'send' : 'save')
    try {
      const prescriptionId = await persist()
      if (!prescriptionId) return
      // One tap does both: the doctor never has to confirm a second time.
      if (alsoSend) {
        const res = await fetch(`/api/prescriptions/${prescriptionId}/whatsapp`, { method: 'POST' })
        if (res.ok) { const d = await res.json().catch(() => ({})); setShare({ state: 'sent', message: `Sent to ${d.to ?? appt?.patient.phone}` }) }
        else setShare({ state: 'failed', message: await readFailure(res, 'Could not send on WhatsApp.') })
      }
      await fetchAppt(true)
    } catch {
      setRxProblem(networkFailureText())
    } finally {
      setRxBusy(null)
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
      if (ok) fetchAppt(true)
    } finally {
      setSavingPay(false)
    }
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
  const rxDirty = rxSnapshot(rx) !== savedRx
  const payDirty = JSON.stringify([payAmount, payMode, payNotes]) !== savedPay
  const tabs = [
    { key: 'notes', label: 'Notes', icon: FileText },
    { key: 'prescription', label: 'Prescription', icon: Pill },
    { key: 'payment', label: 'Payment', icon: CreditCard },
  ] as const

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} className="btn btn-ghost p-2 -ml-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800 [overflow-wrap:anywhere]"><LangText>{appt.patient.name}</LangText></h1>
            <p className="text-sm text-slate-500">{age} yrs · {appt.patient.phone} · {formatDate(appt.startTime)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {appt.visitType === 'TELECONSULTATION' && <span className="badge badge-blue">Phone / video</span>}
          <span className={`badge ${
            appt.status === 'BOOKED' ? 'badge-blue' :
            appt.status === 'COMPLETED' ? 'badge-green' : 'badge-red'
          }`}>{appt.status}</span>
          {appt.status === 'BOOKED' && (
            <>
              <button onClick={() => setRescheduling(true)} className="btn btn-outline btn-sm">
                <CalendarClock size={14} aria-hidden="true" /> Reschedule
              </button>
              <button onClick={markCompleted} className="btn btn-success btn-sm">
                <CheckCircle2 size={14} /> Done
              </button>
            </>
          )}
        </div>
      </div>

      {rescheduling && (
        <RescheduleDialog
          open
          appointmentId={appt.id}
          currentLabel={formatDate(appt.startTime)}
          patientName={appt.patient.name}
          onClose={() => setRescheduling(false)}
          onMoved={() => { setRescheduling(false); fetchAppt(true) }}
        />
      )}

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
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2 sm:px-3 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

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
        <div className="card p-4 sm:p-5 space-y-5">
          <h3 className="font-semibold text-slate-800">Prescription</h3>

          {/* Copies of what is already saved; they wrap onto more lines on a narrow screen instead of running off it */}
          {appt.prescription && (
            <div className="space-y-2 -mt-2">
              <div className="flex flex-wrap gap-2">
                <DocLink href={`/api/prescriptions/${appt.prescription.id}/pdf`} disabled={rxDirty} download>
                  <Download size={14} aria-hidden="true" /> Download PDF
                </DocLink>
                <DocLink href={`/api/prescriptions/${appt.prescription.id}/pdf?inline=1${onLetterhead ? '&mode=preprinted' : ''}`} disabled={rxDirty}>
                  <Printer size={14} aria-hidden="true" /> Print
                </DocLink>
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input type="checkbox" className="mt-0.5" checked={onLetterhead} onChange={e => setOnLetterhead(e.target.checked)} />
                <span>
                  Print on letterhead
                  <span className="block text-xs text-slate-500">Tick when the paper already has your letterhead printed on it.</span>
                </span>
              </label>
              {rxDirty && <p className="text-xs text-amber-700">You have unsaved changes. Save the prescription to download or print the latest version.</p>}
            </div>
          )}

          <PrescriptionFields
            value={rx}
            onChange={patch => setRx(prev => ({ ...prev, ...patch }))}
            baseDate={new Date(appt.startTime).toISOString().slice(0, 10)}
          />

          <HandwrittenRx appointmentId={appt.id} />

          <SaveShareBar
            bleed
            busy={rxBusy}
            canShare={phoneOk}
            sendTo={appt.patient.phone}
            problem={rxProblem}
            share={share}
            onSaveAndShare={() => submitRx(true)}
            onSave={() => submitRx(false)}
          />
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
            <input id="amount" type="number" inputMode="decimal" className="form-input" placeholder="500" value={payAmount} onChange={e => setPayAmount(e.target.value)} min="0" step="0.01" />
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
