'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import { computeAge, formatDate } from '@/lib/slots'

interface Patient {
  id: string
  name: string
  phone: string
  dob: string
  medicalHistory?: string
}

interface TimeSlot {
  start: string
  end: string
  label: string
}

export default function BookPage() {
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [step, setStep] = useState<'select' | 'confirm' | 'success'>('select')
  const [booking, setBooking] = useState(false)
  const [bookedAppointment, setBookedAppointment] = useState<{ id: string; startTime: string } | null>(null)

  // Generate next 14 days for date picker
  const dateOptions = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i))

  useEffect(() => {
    const stored = sessionStorage.getItem('patient')
    const cc = sessionStorage.getItem('chiefComplaint')
    if (!stored) {
      router.replace('/')
      return
    }
    setPatient(JSON.parse(stored))
    if (cc) setChiefComplaint(cc)
  }, [router])

  useEffect(() => {
    if (patient) {
      fetchSlots(selectedDate)
    }
  }, [patient, selectedDate])

  const fetchSlots = async (date: Date) => {
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/appointments?mode=slots&date=${dateStr}`)
      const data = await res.json()
      setSlots(data.slots ?? [])
    } catch {
      // silent fail
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleBook = async () => {
    if (!selectedSlot || !patient) return
    setBooking(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          chiefComplaint,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Booking failed. Please try another slot.')
        return
      }

      setBookedAppointment(data.appointment)
      setStep('success')
      sessionStorage.removeItem('chiefComplaint')
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setBooking(false)
    }
  }

  if (!patient) return null

  const age = computeAge(patient.dob)

  if (step === 'success' && bookedAppointment) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* Header */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={() => router.back()} className="btn btn-ghost p-2 -ml-2" style={{ color: 'rgba(255,255,255,0.70)' }}>
          <CheckCircle2 size={20} className="opacity-0" />
          <ArrowLeft size={20} className="-ml-5" />
        </button>
        <div>
          <h1 className="font-bold text-white text-base leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
            Appointment Confirmed!
          </h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {formatDate(bookedAppointment.startTime)}
          </p>
        </div>
      </div>
        <div className="card p-8 max-w-md w-full text-center animate-slide-up">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(28,92,70,0.12)' }}
          >
            <CheckCircle2 size={40} style={{ color: 'var(--color-pine)' }} />
          </div>
          <h2
            className="text-2xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
          >
            Appointment Confirmed!
          </h2>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-sage)' }}>
            Your appointment is booked for <strong style={{ color: 'var(--color-charcoal)' }}>{formatDate(bookedAppointment.startTime)}</strong>
          </p>

          <div
            className="rounded-lg p-4 mb-6 text-left space-y-2"
            style={{ background: 'var(--color-linen-dark)', border: '1px solid var(--color-sage-border)' }}
          >
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--color-sage)' }}>Patient</span>
              <span className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{patient.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--color-sage)' }}>Date &amp; Time</span>
              <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{formatDate(bookedAppointment.startTime)}</span>
            </div>
          </div>

          <p className="text-sm mb-6" style={{ color: 'var(--color-sage-light)' }}>
            You&apos;ll receive a reminder via WhatsApp and email before your appointment.
          </p>

          <div className="flex flex-col gap-3">
            <button onClick={() => router.push('/appointments')} className="btn btn-primary w-full">
              View My Appointments
            </button>
            <button onClick={() => router.push('/')} className="btn btn-ghost w-full" style={{ color: 'var(--color-sage)' }}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm' && selectedSlot) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={() => setStep('select')} className="btn btn-ghost p-2 -ml-2" style={{ color: 'rgba(255,255,255,0.70)' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-white text-base" style={{ fontFamily: 'var(--font-display)' }}>
          Confirm Appointment
        </h1>
      </div>

        <div className="page-container-sm py-6 space-y-4">
          <div className="card p-6 space-y-4">
            <h2
              className="font-semibold text-lg"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              Appointment Summary
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Patient</span>
                <span className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{patient.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Age</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{age} years</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Phone</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{patient.phone}</span>
              </div>
              <hr className="divider" />
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Date</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{format(parseISO(selectedSlot.start), 'dd MMM yyyy, EEEE')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--color-sage)' }}>Time</span>
                <span className="font-medium font-tabular" style={{ color: 'var(--color-charcoal)' }}>{format(parseISO(selectedSlot.start), 'hh:mm a')} – {format(parseISO(selectedSlot.end), 'hh:mm a')}</span>
              </div>
              {chiefComplaint && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-sage)' }}>Chief Complaint</span>
                  <span className="font-medium text-right max-w-[60%]" style={{ color: 'var(--color-charcoal)' }}>{chiefComplaint}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleBook}
            className="btn btn-primary btn-lg w-full"
            disabled={booking}
          >
          {booking ? (
            <><div className="spinner w-4 h-4" style={{ borderTopColor: 'var(--color-forest)' }} /><span>Booking...</span></>
          ) : (
            'Confirm Booking'
          )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-linen)' }}>
      {/* Header */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ background: 'var(--color-forest)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button onClick={() => router.back()} className="btn btn-ghost p-2 -ml-2" style={{ color: 'rgba(255,255,255,0.70)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-white text-base" style={{ fontFamily: 'var(--font-display)' }}>Book Appointment</h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {patient.name} · {age} years
          </p>
        </div>
      </div>

      <div className="page-container-sm py-6 space-y-5">
        {/* Chief Complaint */}
        <div className="card p-5">
          <div className="form-group">
            <label className="form-label" htmlFor="cc-input">
              Reason for Visit <span className="text-red-500">*</span>
            </label>
            <textarea
              id="cc-input"
              className="form-textarea"
              placeholder="Describe your symptoms or reason for visit..."
              value={chiefComplaint}
              onChange={e => setChiefComplaint(e.target.value)}
              rows={2}
              required
            />
          </div>
        </div>

        {/* Date Selection */}
        <div className="card p-5">
          <h3
            className="font-semibold mb-3 flex items-center gap-2 text-sm"
            style={{ color: 'var(--color-charcoal)' }}
          >
            <Calendar size={15} style={{ color: 'var(--color-sage)' }} />
            Select Date
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {dateOptions.map(date => {
              const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className="shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-lg transition-all text-sm font-medium"
                  style={{
                    background: isSelected ? 'var(--color-forest)' : '#FFFEF9',
                    color: isSelected ? 'white' : 'var(--color-charcoal-mid)',
                    border: isSelected ? '1.5px solid var(--color-forest)' : '1.5px solid var(--color-sage-border)',
                    boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                  }}
                >
                  <span className="text-xs" style={{ opacity: isSelected ? 0.80 : 0.65 }}>{format(date, 'EEE')}</span>
                  <span className="text-lg font-bold font-tabular">{format(date, 'd')}</span>
                  {isToday && <span className="text-xs" style={{ color: isSelected ? 'var(--color-gold)' : 'var(--color-sage)' }}>Today</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Time Slots */}
        <div className="card p-5">
          <h3
            className="font-semibold mb-3 flex items-center gap-2 text-sm"
            style={{ color: 'var(--color-charcoal)' }}
          >
            <Clock size={15} style={{ color: 'var(--color-sage)' }} />
            Available Slots — {format(selectedDate, 'EEEE, dd MMM')}
          </h3>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--color-sage)' }}>
              <div className="spinner" />
              <span className="text-sm">Loading slots...</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--color-sage)' }}>
              <Clock size={32} className="mx-auto mb-2" style={{ opacity: 0.35 }} />
              <p className="text-sm">No slots available on this day</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-sage-light)' }}>Try selecting another date</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map(slot => {
                const isSelected = selectedSlot?.start === slot.start
                return (
                <button
                    key={slot.start}
                    onClick={() => setSelectedSlot(slot)}
                    className="py-2.5 px-2 rounded-lg text-sm font-medium font-tabular transition-all"
                    style={{
                      background: isSelected ? 'var(--color-forest)' : '#FFFEF9',
                      color: isSelected ? 'white' : 'var(--color-charcoal-mid)',
                      border: `1.5px solid ${isSelected ? 'var(--color-forest)' : 'var(--color-sage-border)'}`,
                      boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                    }}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Continue button */}
        <button
          onClick={() => selectedSlot && chiefComplaint && setStep('confirm')}
          className="btn btn-primary btn-lg w-full"
          disabled={!selectedSlot || !chiefComplaint}
        >
          Continue <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
