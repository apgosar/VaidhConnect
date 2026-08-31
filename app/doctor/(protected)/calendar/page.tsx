'use client'

import { useState, useEffect } from 'react'
import { format, addDays, subDays, parseISO, isSameDay, startOfDay, endOfDay, isBefore } from 'date-fns'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Calendar, Clock, Plus } from 'lucide-react'
import { formatDate, computeAge } from '@/lib/slots'

interface Appointment {
  id: string
  startTime: string
  endTime: string
  status: string
  chiefComplaint?: string
  patient: { id: string; name: string; phone: string; dob: string }
  prescription?: { id: string } | null
  payment?: { id: string } | null
}

export default function CalendarPage() {
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()))
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'agenda'>('week')

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
  const weekStart = weekDays[0]
  const weekEnd = endOfDay(weekDays[6])
  const isCurrentPeriod = isSameDay(startDate, startOfDay(new Date())) || isBefore(startDate, startOfDay(new Date()))

  useEffect(() => {
    fetchAppointments()
  }, [startDate])

  const fetchAppointments = async () => {
    setLoading(true)
    try {
      const from = weekStart.toISOString()
      const to = weekEnd.toISOString()
      const res = await fetch(`/api/doctor/appointments?from=${from}&to=${to}`)
      const data = await res.json()
      setAppointments(data.appointments ?? [])
    } finally {
      setLoading(false)
    }
  }

  // Filter out past and cancelled appointments
  const now = new Date()
  const activeAppointments = appointments.filter(a => {
    if (a.status === 'CANCELLED') return false
    const end = parseISO(a.endTime || a.startTime)
    return end >= now
  })

  const getApptsForDay = (day: Date) =>
    activeAppointments.filter(a => isSameDay(parseISO(a.startTime), day))

  const handlePrevWeek = () => {
    setStartDate(prev => {
      const target = subDays(prev, 7)
      const todayStart = startOfDay(new Date())
      return isBefore(target, todayStart) ? todayStart : target
    })
  }

  const handleNextWeek = () => {
    setStartDate(prev => addDays(prev, 7))
  }

  const handleToday = () => {
    setStartDate(startOfDay(new Date()))
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'BOOKED':    return { background: 'rgba(15,61,46,0.07)', border: '1px solid rgba(15,61,46,0.18)', color: 'var(--color-forest)' }
      case 'COMPLETED': return { background: 'rgba(28,92,70,0.08)', border: '1px solid rgba(28,92,70,0.20)', color: 'var(--color-pine)' }
      default:          return { background: 'var(--color-linen-dark)', border: '1px solid var(--color-sage-border)', color: 'var(--color-charcoal)' }
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
        >
          Calendar
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-sage-border)' }}>
            <button
              onClick={() => setView('agenda')}
              className="px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: view === 'agenda' ? 'var(--color-forest)' : 'transparent',
                color: view === 'agenda' ? 'white' : 'var(--color-sage)',
              }}
            >
              Agenda
            </button>
            <button
              onClick={() => setView('week')}
              className="px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: view === 'week' ? 'var(--color-forest)' : 'transparent',
                color: view === 'week' ? 'white' : 'var(--color-sage)',
              }}
            >
              Week
            </button>
          </div>
          <Link href="/doctor/blocked-slots" className="btn btn-outline btn-sm">
            <Plus size={14} /> Block Time
          </Link>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between card px-4 py-3">
        <button
          onClick={handlePrevWeek}
          disabled={isCurrentPeriod}
          className="btn btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
          title={isCurrentPeriod ? 'Cannot navigate to past dates' : 'Previous 7 days'}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-semibold" style={{ color: 'var(--color-charcoal)' }}>
            {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
          </p>
          <button
            onClick={handleToday}
            disabled={isCurrentPeriod}
            className={`text-xs mt-0.5 font-medium ${isCurrentPeriod ? 'opacity-40 cursor-default' : 'hover:underline'}`}
            style={{ color: 'var(--color-gold-dark)' }}
          >
            Today
          </button>
        </div>
        <button onClick={handleNextWeek} className="btn btn-ghost p-2" title="Next 7 days">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: 'var(--color-sage)' }}>
          <div className="spinner" />
          <span className="text-sm">Loading appointments...</span>
        </div>
      ) : view === 'agenda' ? (
        // Agenda view
        <div className="space-y-4">
          {weekDays.map(day => {
            const dayAppts = getApptsForDay(day)
            const isToday = isSameDay(day, new Date())
            if (dayAppts.length === 0) return null
            return (
              <div key={day.toISOString()}>
                <div className="flex items-center gap-2 mb-2" style={{ color: isToday ? 'var(--color-forest)' : 'var(--color-sage)' }}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      background: isToday ? 'var(--color-forest)' : 'var(--color-linen-dark)',
                      color: isToday ? 'white' : 'var(--color-charcoal-mid)',
                    }}
                  >
                    {format(day, 'd')}
                  </div>
                  <span className="text-sm font-semibold font-tabular">{format(day, 'EEEE, dd MMM')}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)' }}
                  >
                    {dayAppts.length} appt{dayAppts.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2 pl-10">
                  {dayAppts.map(appt => (
                    <Link
                      key={appt.id}
                      href={`/doctor/appointments/${appt.id}`}
                      className="block card-data p-3 hover:shadow-md transition-shadow"
                      style={statusColor(appt.status)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">{appt.patient.name}</p>
                          <p className="text-xs opacity-70">{computeAge(appt.patient.dob)} yrs · {appt.patient.phone}</p>
                          {appt.chiefComplaint && <p className="text-xs opacity-70 mt-0.5">{appt.chiefComplaint}</p>}
                        </div>
                        <div className="text-right text-xs shrink-0 ml-2">
                          <p className="font-medium font-tabular">{format(parseISO(appt.startTime), 'hh:mm a')}</p>
                          <div className="flex gap-1 justify-end mt-1">
                            {appt.prescription && <span className="badge badge-green" style={{ fontSize: 9 }}>Rx</span>}
                            {appt.payment && <span className="badge badge-blue" style={{ fontSize: 9 }}>Paid</span>}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}

          {activeAppointments.length === 0 && (
            <div className="text-center py-12">
              <Calendar size={40} className="mx-auto mb-2" style={{ color: 'var(--color-sage-light)' }} />
              <p style={{ color: 'var(--color-sage)' }}>No upcoming appointments for this period</p>
            </div>
          )}
        </div>
      ) : (
        // Week grid view (desktop-optimized)
        <div className="card overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {weekDays.map(day => {
                const isToday = isSameDay(day, new Date())
                const dayAppts = getApptsForDay(day)
                return (
                  <div
                    key={day.toISOString()}
                    className="p-3 text-center"
                    style={{
                      borderRight: '1px solid var(--color-sage-border)',
                      background: isToday ? 'var(--color-primary-bg)' : 'transparent',
                    }}
                  >
                    <p className="text-xs font-medium" style={{ color: 'var(--color-sage)' }}>{format(day, 'EEE')}</p>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-1 text-sm font-bold font-tabular"
                      style={{
                        background: isToday ? 'var(--color-forest)' : 'transparent',
                        color: isToday ? 'white' : 'var(--color-charcoal-mid)',
                      }}
                    >
                      {format(day, 'd')}
                    </div>
                    {dayAppts.length > 0 && (
                      <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-gold-dark)' }}>{dayAppts.length} apt</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Appointment cells */}
            <div className="grid grid-cols-7 min-h-[300px]">
              {weekDays.map(day => {
                const dayAppts = getApptsForDay(day)
                const isToday = isSameDay(day, new Date())
                return (
                  <div key={day.toISOString()} className={`border-r border-slate-100 last:border-0 p-2 space-y-1.5 ${isToday ? 'bg-blue-50/40' : ''}`}>
                    {dayAppts.map(appt => (
                      <Link
                        key={appt.id}
                        href={`/doctor/appointments/${appt.id}`}
                        className="block rounded-lg p-2 text-xs hover:opacity-80 transition-opacity"
                        style={statusColor(appt.status)}
                      >
                        <p className="font-semibold truncate">{appt.patient.name}</p>
                        <p className="opacity-70 font-tabular">{format(parseISO(appt.startTime), 'hh:mm a')}</p>
                      </Link>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
