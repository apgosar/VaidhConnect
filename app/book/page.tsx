'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, CheckCircle2, ChevronRight, ChevronLeft, Download } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import { computeAge, formatDate } from '@/lib/slots'
import { createGoogleCalendarUrl, downloadIcsFile } from '@/lib/calendar'

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

interface BookedAppointment {
  id: string
  startTime: string
  endTime?: string
  chiefComplaint?: string
  doctor?: {
    name?: string
    clinicName?: string
    address?: string
    phone?: string
  }
}

export default function BookPage() {
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [step, setStep] = useState<'select' | 'confirm' | 'success'>('select')
  const [booking, setBooking] = useState(false)
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointment | null>(null)

  // Generate next 14 days for date picker
  const dateOptions = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i))

  useEffect(() => {
    const stored = sessionStorage.getItem('patient')
    if (!stored) {
      router.replace('/')
      return
    }
    setPatient(JSON.parse(stored))
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
      const chiefComplaint = sessionStorage.getItem('chiefComplaint')
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          chiefComplaint: chiefComplaint || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Booking failed. Please try another slot.')
        return
      }

      setBookedAppointment(data.appointment)
      setStep('success')
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setBooking(false)
    }
  }

  if (!patient) return null

  const age = computeAge(patient.dob)

  if (step === 'success' && bookedAppointment) {
    const eventTitle = `Doctor Appointment - ${bookedAppointment.doctor?.clinicName || 'Clinic'}`
    const eventDescription = `Appointment with ${bookedAppointment.doctor?.name || 'Doctor'} at ${bookedAppointment.doctor?.clinicName || 'Clinic'}.\nPatient: ${patient.name}\n${bookedAppointment.chiefComplaint ? `Chief Complaint: ${bookedAppointment.chiefComplaint}\n` : ''}${bookedAppointment.doctor?.phone ? `Clinic Phone: ${bookedAppointment.doctor.phone}` : ''}`
    const eventLocation = bookedAppointment.doctor?.address || bookedAppointment.doctor?.clinicName || 'Clinic'
    const apptEndTime = bookedAppointment.endTime || selectedSlot?.end || bookedAppointment.startTime

    const googleCalUrl = createGoogleCalendarUrl({
      id: bookedAppointment.id,
      title: eventTitle,
      description: eventDescription,
      location: eventLocation,
      startTime: bookedAppointment.startTime,
      endTime: apptEndTime,
    })

    const handleDownloadIcs = () => {
      downloadIcsFile(
        {
          id: bookedAppointment.id,
          title: eventTitle,
          description: eventDescription,
          location: eventLocation,
          startTime: bookedAppointment.startTime,
          endTime: apptEndTime,
        },
        `appointment-${patient.name.toLowerCase().replace(/\s+/g, '-')}.ics`
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

        <div className="page-container-sm py-8 flex flex-col items-center justify-center">
          <div className="card p-6 sm:p-8 max-w-md w-full text-center animate-slide-up">
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
              className="rounded-lg p-4 mb-5 text-left space-y-2"
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
              {bookedAppointment.doctor?.clinicName && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-sage)' }}>Clinic</span>
                  <span className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{bookedAppointment.doctor.clinicName}</span>
                </div>
              )}
            </div>

            {/* Add to Calendar */}
            <div
              className="rounded-xl p-4 mb-6 text-left"
              style={{ background: 'var(--color-primary-bg)', border: '1px solid var(--color-sage-border)' }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5"
                style={{ color: 'var(--color-forest)' }}
              >
                <Calendar size={14} /> Add to Calendar
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href={googleCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline text-xs py-2 px-2.5 flex items-center justify-center gap-2 rounded-lg font-medium"
                  style={{
                    background: '#FFFEF9',
                    borderColor: 'var(--color-sage-border)',
                    color: 'var(--color-charcoal)',
                  }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Google Cal
                </a>
                <button
                  type="button"
                  onClick={handleDownloadIcs}
                  className="btn btn-outline text-xs py-2 px-2.5 flex items-center justify-center gap-1.5 rounded-lg font-medium"
                  style={{
                    background: '#FFFEF9',
                    borderColor: 'var(--color-sage-border)',
                    color: 'var(--color-charcoal)',
                  }}
                >
                  <Download size={14} className="shrink-0" style={{ color: 'var(--color-pine)' }} />
                  iCal / Apple
                </button>
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
          onClick={() => selectedSlot && setStep('confirm')}
          className="btn btn-primary btn-lg w-full"
          disabled={!selectedSlot}
        >
          Continue <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
