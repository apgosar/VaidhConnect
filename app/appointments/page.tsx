'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatDate } from '@/lib/slots'

interface Appointment {
  id: string
  startTime: string
  endTime: string
  status: string
  chiefComplaint?: string
}

interface Patient {
  id: string
  name: string
  phone: string
}

export default function AppointmentsPage() {
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('patient')
    if (!stored) {
      router.replace('/')
      return
    }
    const p = JSON.parse(stored) as Patient
    setPatient(p)
    fetchAppointments(p.id)
  }, [router])

  const fetchAppointments = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/appointments?patientId=${encodeURIComponent(id)}`)
      const data = await res.json()
      setAppointments(data.appointments ?? [])
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (id: string) => {
    if (cancelConfirm !== id) {
      setCancelConfirm(id)
      return
    }

    setCancelling(id)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (res.ok) {
        setAppointments(prev => prev.filter(a => a.id !== id))
        setCancelConfirm(null)
      }
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={() => router.back()} className="btn btn-ghost p-2 -ml-2" style={{ color: 'rgba(255,255,255,0.70)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-white text-base" style={{ fontFamily: 'var(--font-display)' }}>My Appointments</h1>
          {patient && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{patient.phone}</p>}
        </div>
      </div>

      <div className="page-container-sm py-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'var(--color-sage)' }}>
            <div className="spinner" />
            <span className="text-sm">Loading appointments...</span>
          </div>
        ) : appointments.length === 0 ? (
          <div className="card p-8 text-center">
            <Calendar size={40} className="mx-auto mb-3" style={{ color: 'var(--color-sage-light)' }} />
            <p className="font-medium" style={{ color: 'var(--color-sage)' }}>No upcoming appointments</p>
            <button onClick={() => router.push('/book')} className="btn btn-primary mt-4">
              Book an Appointment
            </button>
          </div>
        ) : (
          appointments.map(appt => (
            <div key={appt.id} className="card p-5 space-y-3 animate-fade-in">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-800">{formatDate(appt.startTime)}</p>
                  {appt.chiefComplaint && (
                    <p className="text-sm text-slate-500 mt-0.5">{appt.chiefComplaint}</p>
                  )}
                </div>
                <span className="status-booked">Upcoming</span>
              </div>

              {cancelConfirm === appt.id ? (
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'rgba(181,74,60,0.06)', border: '1px solid rgba(181,74,60,0.18)' }}
                  >
                    <p className="text-sm font-medium flex items-center gap-1.5 mb-3" style={{ color: '#B54A3C' }}>
                      <AlertTriangle size={14} />
                      Are you sure you want to cancel?
                    </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCancel(appt.id)}
                      className="btn btn-danger flex-1"
                      disabled={cancelling === appt.id}
                    >
                      {cancelling === appt.id ? 'Cancelling...' : 'Yes, Cancel'}
                    </button>
                    <button
                      onClick={() => setCancelConfirm(null)}
                      className="btn btn-ghost flex-1"
                    >
                      Keep Appointment
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleCancel(appt.id)}
                  className="btn btn-outline w-full text-red-500 border-red-200 hover:bg-red-50"
                >
                  Cancel Appointment
                </button>
              )}
            </div>
          ))
        )}

        <button
          onClick={() => router.push('/book')}
          className="btn btn-primary w-full"
        >
          Book New Appointment
        </button>
      </div>
    </div>
  )
}
