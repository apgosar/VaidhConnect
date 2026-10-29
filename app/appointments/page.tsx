'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, AlertTriangle } from 'lucide-react'
import { formatDateTimeInTz } from '@/lib/time'
import { getBookings, removeBooking } from '@/lib/patientDevice'
import SiteFooter from '@/components/SiteFooter'

interface Appointment {
  id: string
  startTime: string
  endTime: string
  status: string
  chiefComplaint?: string | null
  patientName?: string | null
}

// Appointments booked from THIS device. Each is shown only because the device
// holds that appointment's secret token — there is no lookup by phone or name.
export default function AppointmentsPage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ config }, ] = await Promise.all([fetch('/api/public/config').then(r => r.json())])
      setTimezone(config.timezone)

      const items = getBookings().map(b => ({ id: b.id, token: b.token }))
      if (items.length === 0) { setAppointments([]); return }

      const res = await fetch('/api/appointments/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      const found: Appointment[] = data.appointments ?? []

      // Forget bookings the clinic no longer recognises (e.g. old or deleted).
      const known = new Set(found.map(a => a.id))
      for (const b of getBookings()) if (!known.has(b.id)) removeBooking(b.id)

      const now = Date.now()
      setAppointments(found.filter(a => a.status === 'BOOKED' && new Date(a.startTime).getTime() >= now))
    } catch {
      setError('Could not load your appointments. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCancel = async (id: string) => {
    if (cancelConfirm !== id) { setCancelConfirm(id); return }

    const token = getBookings().find(b => b.id === id)?.token
    if (!token) return
    setCancelling(id)
    setError('')
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', token }),
      })
      if (res.ok) {
        removeBooking(id)
        setAppointments(prev => prev.filter(a => a.id !== id))
        setCancelConfirm(null)
      } else {
        setError((await res.json()).error ?? 'Could not cancel. Please call the clinic.')
      }
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      <div className="px-4 py-4 flex items-center gap-3" style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => router.push('/')} className="btn btn-ghost p-2 -ml-2" style={{ color: 'rgba(255,255,255,0.70)' }} aria-label="Back to home">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-white text-base" style={{ fontFamily: 'var(--font-display)' }}>My Appointments</h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Booked on this device</p>
        </div>
      </div>

      <div className="page-container-sm py-6 space-y-4">
        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'var(--color-sage)' }}>
            <div className="spinner" /><span className="text-sm">Loading appointments...</span>
          </div>
        ) : appointments.length === 0 ? (
          <div className="card p-8 text-center">
            <Calendar size={40} className="mx-auto mb-3" style={{ color: 'var(--color-sage-light)' }} />
            <p className="font-medium" style={{ color: 'var(--color-sage)' }}>No upcoming appointments</p>
            <p className="text-xs mt-2" style={{ color: 'var(--color-sage-light)' }}>
              Appointments booked on another device, or by the clinic on your behalf, aren&apos;t shown here — call the clinic to change them.
            </p>
            <button onClick={() => router.push('/register')} className="btn btn-primary mt-4">Book an Appointment</button>
          </div>
        ) : (
          appointments.map(appt => (
            <div key={appt.id} className="card p-5 space-y-3 animate-fade-in">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-800">{formatDateTimeInTz(new Date(appt.startTime), timezone)}</p>
                  {appt.patientName && <p className="text-sm text-slate-500 mt-0.5">{appt.patientName}</p>}
                  {appt.chiefComplaint && <p className="text-sm text-slate-500 mt-0.5">{appt.chiefComplaint}</p>}
                </div>
                <span className="status-booked">Upcoming</span>
              </div>

              {cancelConfirm === appt.id ? (
                <div className="rounded-lg p-3" style={{ background: 'rgba(181,74,60,0.06)', border: '1px solid rgba(181,74,60,0.18)' }}>
                  <p className="text-sm font-medium flex items-center gap-1.5 mb-3" style={{ color: '#B54A3C' }}>
                    <AlertTriangle size={14} /> Are you sure you want to cancel?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => handleCancel(appt.id)} className="btn btn-danger flex-1" disabled={cancelling === appt.id}>
                      {cancelling === appt.id ? 'Cancelling...' : 'Yes, Cancel'}
                    </button>
                    <button onClick={() => setCancelConfirm(null)} className="btn btn-ghost flex-1">Keep Appointment</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => handleCancel(appt.id)} className="btn btn-outline w-full text-red-500 border-red-200 hover:bg-red-50">
                  Cancel Appointment
                </button>
              )}
            </div>
          ))
        )}

        <button onClick={() => router.push('/')} className="btn btn-primary w-full">Book New Appointment</button>
      </div>
      <SiteFooter />
    </div>
  )
}
