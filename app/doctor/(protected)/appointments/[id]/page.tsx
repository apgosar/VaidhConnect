'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Clock, FileText, CreditCard,
  CheckCircle2, XCircle, Edit3, Save, Pill, Plus, Trash2,
  Download, Share2, Phone
} from 'lucide-react'
import { formatDate, computeAge } from '@/lib/slots'
import { format, parseISO } from 'date-fns'
import type { Medicine } from '@/lib/constants'
import { PAYMENT_MODES } from '@/lib/constants'
import PrescriptionPDF from '@/components/doctor/PrescriptionPDF'
import ReceiptPDF from '@/components/doctor/ReceiptPDF'

interface Patient {
  id: string; name: string; phone: string; dob: string; medicalHistory?: string; email?: string
}
interface Appointment {
  id: string; startTime: string; endTime: string; status: string;
  chiefComplaint?: string; consultationNotes?: string;
  patient: Patient;
  prescription?: { id: string; diagnosis?: string; medicines: Medicine[]; notes?: string; pdfPath?: string }
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
  const [savingRx, setSavingRx] = useState(false)

  // Payment state
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('CASH')
  const [payNotes, setPayNotes] = useState('')
  const [savingPay, setSavingPay] = useState(false)

  const [showPrescriptionPDF, setShowPrescriptionPDF] = useState(false)
  const [showReceiptPDF, setShowReceiptPDF] = useState(false)
  const [doctorInfo, setDoctorInfo] = useState<{ name: string; clinicName: string; qualifications?: string; address?: string; phone?: string } | null>(null)

  const fetchAppt = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/appointments/${id}`)
      const data = await res.json()
      setAppt(data.appointment)
      setNotes(data.appointment?.consultationNotes ?? '')
      if (data.appointment?.prescription) {
        setDiagnosis(data.appointment.prescription.diagnosis ?? '')
        setMedicines(data.appointment.prescription.medicines?.length ? data.appointment.prescription.medicines : [{ name: '', dosage: '', frequency: '', duration: '' }])
        setPrescriptionNotes(data.appointment.prescription.notes ?? '')
      }
      if (data.appointment?.payment) {
        setPayAmount(data.appointment.payment.amount?.toString() ?? '')
        setPayMode(data.appointment.payment.mode ?? 'CASH')
        setPayNotes(data.appointment.payment.notes ?? '')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAppt()
    // Fetch doctor info for PDF
    fetch('/api/doctor/profile').then(r => r.json()).then(d => setDoctorInfo(d.doctor))
  }, [fetchAppt])

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationNotes: notes }),
      })
      setEditingNotes(false)
      fetchAppt()
    } finally {
      setSavingNotes(false)
    }
  }

  const markCompleted = async () => {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    fetchAppt()
  }

  const savePrescription = async () => {
    if (!appt) return
    setSavingRx(true)
    try {
      await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appt.id,
          patientId: appt.patient.id,
          diagnosis,
          medicines: medicines.filter(m => m.name),
          notes: prescriptionNotes,
        }),
      })
      fetchAppt()
    } finally {
      setSavingRx(false)
    }
  }

  const savePayment = async () => {
    if (!appt) return
    setSavingPay(true)
    try {
      await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appt.id,
          patientId: appt.patient.id,
          amount: parseFloat(payAmount),
          mode: payMode,
          notes: payNotes,
        }),
      })
      fetchAppt()
    } finally {
      setSavingPay(false)
    }
  }

  const addMedicine = () => setMedicines(prev => [...prev, { name: '', dosage: '', frequency: '', duration: '' }])
  const removeMedicine = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i))
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
    return <div className="text-center py-20 text-slate-400">Appointment not found</div>
  }

  const age = computeAge(appt.patient.dob)
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
            <textarea
              className="form-textarea min-h-[200px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Enter consultation notes, findings, diagnosis summary..."
              autoFocus
            />
          ) : (
            <div className="min-h-[100px] text-slate-700 whitespace-pre-wrap">
              {notes || <span className="text-slate-400 italic">No notes yet. Click Edit to add.</span>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'prescription' && (
        <div className="card p-5 space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Prescription</h3>
            {appt.prescription && (
              <button onClick={() => setShowPrescriptionPDF(true)} className="btn btn-outline btn-sm">
                <Download size={14} /> Download PDF
              </button>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Diagnosis</label>
            <textarea
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
                      <button onClick={() => removeMedicine(i)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input
                        className="form-input"
                        placeholder="Medicine name"
                        value={med.name}
                        onChange={e => updateMedicine(i, 'name', e.target.value)}
                      />
                    </div>
                    <input className="form-input" placeholder="Dosage (e.g. 500mg)" value={med.dosage} onChange={e => updateMedicine(i, 'dosage', e.target.value)} />
                    <input className="form-input" placeholder="Frequency (e.g. 3x daily)" value={med.frequency} onChange={e => updateMedicine(i, 'frequency', e.target.value)} />
                    <input className="form-input" placeholder="Duration (e.g. 5 days)" value={med.duration} onChange={e => updateMedicine(i, 'duration', e.target.value)} />
                    <input className="form-input" placeholder="Instructions (optional)" value={med.instructions ?? ''} onChange={e => updateMedicine(i, 'instructions', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Additional Notes</label>
            <textarea
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
            <label className="form-label">Amount (₹)</label>
            <input type="number" className="form-input" placeholder="500" value={payAmount} onChange={e => setPayAmount(e.target.value)} min="0" step="0.01" />
          </div>

          <div className="form-group">
            <label className="form-label">Payment Mode</label>
            <select className="form-select" value={payMode} onChange={e => setPayMode(e.target.value)}>
              {PAYMENT_MODES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input className="form-input" placeholder="Any payment notes..." value={payNotes} onChange={e => setPayNotes(e.target.value)} />
          </div>

          <button onClick={savePayment} className="btn btn-primary w-full" disabled={savingPay || !payAmount}>
            <Save size={16} /> {savingPay ? 'Saving...' : appt.payment ? 'Update Payment' : 'Record Payment'}
          </button>

          {appt.payment && (
            <button onClick={() => setShowReceiptPDF(true)} className="btn btn-outline w-full">
              <Download size={16} /> Generate Receipt PDF
            </button>
          )}
        </div>
      )}

      {/* PDF Modals */}
      {showPrescriptionPDF && appt.prescription && doctorInfo && (
        <PrescriptionPDF
          prescription={appt.prescription}
          patient={appt.patient}
          appointment={appt}
          doctor={doctorInfo}
          onClose={() => setShowPrescriptionPDF(false)}
        />
      )}
      {showReceiptPDF && appt.payment && doctorInfo && (
        <ReceiptPDF
          payment={appt.payment}
          patient={appt.patient}
          appointment={appt}
          doctor={doctorInfo}
          onClose={() => setShowReceiptPDF(false)}
        />
      )}
    </div>
  )
}
