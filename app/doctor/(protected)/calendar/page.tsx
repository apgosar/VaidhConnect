'use client'

import { useState, useEffect } from 'react'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, parseISO, isSameDay } from 'date-fns'
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
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'agenda'>('agenda')

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    fetchAppointments()
  }, [currentWeek])

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

  const getApptsForDay = (day: Date) =>
    appointments.filter(a => isSameDay(parseISO(a.startTime), day))

  const statusColor = (status: string) => {
    switch (status) {
      case 'BOOKED':    return { background: 'rgba(15,61,46,0.07)', border: '1px solid rgba(15,61,46,0.18)', color: 'var(--color-forest)' }
      case 'COMPLETED': return { background: 'rgba(28,92,70,0.08)', border: '1px solid rgba(28,92,70,0.20)', color: 'var(--color-pine)' }
      case 'CANCELLED': return { background: 'rgba(181,74,60,0.06)', border: '1px solid rgba(181,74,60,0.16)', color: '#B54A3C', textDecoration: 'line-through', opacity: 0.65 }
      default:          return { background: 'var(--color-linen-dark)', border: '1px solid var(--color-sage-border)' }
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
        <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} className="btn btn-ghost p-2">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-semibold" style={{ color: 'var(--color-charcoal)' }}>
            {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
          </p>
          <button
            onClick={() => setCurrentWeek(new Date())}
            className="text-xs mt-0.5 font-medium"
            style={{ color: 'var(--color-gold-dark)' }}
          >
            Today
          </button>
        </div>
        <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} className="btn btn-ghost p-2">
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
                <div className={`flex items-center gap-2 mb-2`} style={{ color: isToday ? 'var(--color-forest)' : 'var(--color-sage)' }}>
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

          {appointments.filter(a => a.status !== 'CANCELLED').length === 0 && (
            <div className="text-center py-12">
              <Calendar size={40} className="mx-auto mb-2" style={{ color: 'var(--color-sage-light)' }} />
              <p style={{ color: 'var(--color-sage)' }}>No appointments this week</p>
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
                    <p className="text-xs mt-1" style={{ color: 'var(--color-gold-dark)' }}>{dayAppts.length} apt</p>
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
                      <Link key={appt.id} href={`/doctor/appointments/${appt.id}`}
                        className={`block rounded-lg p-2 text-xs border hover:opacity-80 transition-opacity ${statusColor(appt.status)}`}
                      >
                        <p className="font-semibold truncate">{appt.patient.name}</p>
                        <p className="opacity-70">{format(parseISO(appt.startTime), 'hh:mm a')}</p>
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
