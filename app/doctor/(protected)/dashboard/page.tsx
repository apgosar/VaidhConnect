import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { formatDate, formatDateOnly } from '@/lib/slots'
import { computeAge } from '@/lib/slots'
import { startOfDay, endOfDay, addDays } from 'date-fns'
import Link from 'next/link'
import { Calendar, Users, CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DoctorDashboard() {
  const session = await auth()
  const doctorId = session?.user?.id
  if (!doctorId) return null

  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)
  const weekEnd = endOfDay(addDays(today, 7))

  const [todayAppts, upcomingAppts, totalPatients, completedToday] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId, status: 'BOOKED', startTime: { gte: todayStart, lte: todayEnd } },
      include: {
        patient: { select: { id: true, name: true, phone: true, dob: true } },
        prescription: { select: { id: true } },
        payment: { select: { id: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.appointment.findMany({
      where: { doctorId, status: 'BOOKED', startTime: { gt: todayEnd, lte: weekEnd } },
      include: { patient: { select: { id: true, name: true } } },
      orderBy: { startTime: 'asc' },
      take: 10,
    }),
    prisma.patient.count(),
    prisma.appointment.count({
      where: { doctorId, status: 'COMPLETED', startTime: { gte: todayStart, lte: todayEnd } },
    }),
  ])

  const greeting = today.getHours() < 12 ? 'Morning' : today.getHours() < 17 ? 'Afternoon' : 'Evening'
  const firstName = session?.user?.name?.split(' ')[0]

  const stats = [
    { label: "Today's Appointments", value: todayAppts.length, icon: Calendar },
    { label: 'Completed Today', value: completedToday, icon: CheckCircle2 },
    { label: 'Total Patients', value: totalPatients, icon: Users },
    { label: 'Upcoming (7 days)', value: upcomingAppts.length, icon: Clock },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Greeting ─────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--color-sage-border)', paddingBottom: '20px' }}>
        <h1
          className="text-2xl md:text-3xl font-bold leading-tight"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
        >
          Good {greeting}, Dr. {firstName}&nbsp;🌿
        </h1>
        <p
          className="mt-1 text-sm font-tabular"
          style={{ color: 'var(--color-sage)' }}
        >
          {formatDateOnly(today)}
        </p>
      </div>

      {/* ── Stat Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card-data p-4">
            {/* Icon — single tone-on-tone forest green palette */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ background: 'var(--color-primary-bg)' }}
            >
              <Icon size={18} style={{ color: 'var(--color-forest)' }} />
            </div>
            <p
              className="text-2xl font-bold font-tabular leading-none"
              style={{ color: 'var(--color-charcoal)' }}
            >
              {value}
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-sage)' }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Today's Schedule ─────────────────────────────── */}
      <div className="card-data overflow-hidden">
        <div
          className="flex justify-between items-center px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-sage-border)' }}
        >
          <h2
            className="font-semibold text-base"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
          >
            Today&apos;s Schedule
          </h2>
          <Link
            href="/doctor/calendar"
            className="text-sm flex items-center gap-1 font-medium"
            style={{ color: 'var(--color-gold-dark)' }}
          >
            Full Calendar <ChevronRight size={14} />
          </Link>
        </div>

        {todayAppts.length === 0 ? (
          <div className="p-10 text-center">
            <Calendar size={28} className="mx-auto mb-2" style={{ color: 'var(--color-sage-light)' }} />
            <p className="text-sm" style={{ color: 'var(--color-sage)' }}>No appointments scheduled today</p>
          </div>
        ) : (
          <div>
            {todayAppts.map((appt, idx) => (
              <Link
                key={appt.id}
                href={`/doctor/appointments/${appt.id}`}
                className="flex items-center justify-between px-5 py-3.5 group transition-colors hover:bg-[var(--color-primary-bg)]"
                style={{
                  borderBottom: idx < todayAppts.length - 1 ? '1px solid var(--color-sage-border)' : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar — forest green, white initial */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--color-forest)' }}
                  >
                    {appt.patient.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--color-charcoal)' }}>
                      {appt.patient.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-sage)' }}>
                      {computeAge(appt.patient.dob)} yrs · {appt.patient.phone}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium font-tabular" style={{ color: 'var(--color-charcoal-mid)' }}>
                      {formatDate(appt.startTime).split(',')[1]?.trim()}
                    </p>
                    <div className="flex gap-1 justify-end mt-1">
                      {appt.prescription && (
                        <span className="badge badge-green" style={{ fontSize: '10px' }}>Rx</span>
                      )}
                      {appt.payment && (
                        <span className="badge badge-blue" style={{ fontSize: '10px' }}>Paid</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    size={15}
                    style={{ color: 'var(--color-sage-light)', transition: 'color 0.12s' }}
                    className="group-hover:!text-[var(--color-sage)]"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Upcoming appointments ────────────────────────── */}
      {upcomingAppts.length > 0 && (
        <div className="card-data overflow-hidden">
          <div
            className="px-5 py-4"
            style={{ borderBottom: '1px solid var(--color-sage-border)' }}
          >
            <h2
              className="font-semibold text-base"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              Upcoming — Next 7 Days
            </h2>
          </div>
          <div>
            {upcomingAppts.map((appt, idx) => (
              <Link
                key={appt.id}
                href={`/doctor/appointments/${appt.id}`}
                className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-[var(--color-primary-bg)]"
                style={{
                  borderBottom: idx < upcomingAppts.length - 1 ? '1px solid var(--color-sage-border)' : 'none',
                }}
              >
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--color-charcoal)' }}>
                    {appt.patient.name}
                  </p>
                  <p className="text-xs font-tabular" style={{ color: 'var(--color-sage)' }}>
                    {formatDate(appt.startTime)}
                  </p>
                </div>
                <ChevronRight size={15} style={{ color: 'var(--color-sage-light)' }} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
