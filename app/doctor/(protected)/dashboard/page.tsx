import { getSession } from '@/lib/auth/session'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { notFound } from 'next/navigation'
import { dayBoundsInTz, ymdInTz } from '@/lib/time'
import { formatDate, formatDateOnly, formatBlockRangeForDay, isMultiDayBlock } from '@/lib/slots'
import { ageSex } from '@/lib/gender'
import { ContactButtons } from '@/components/doctor/ContactButtons'
import { startOfDay, endOfDay, addDays } from 'date-fns'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Users, CheckCircle2, Clock, ChevronRight, CalendarOff, FilePlus2 } from 'lucide-react'
import { can } from '@/lib/auth/access'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard' }

export default async function DoctorDashboard() {
  const session = await getSession()
  const doctorId = session ? (await getTenant())?.clinicId : undefined
  if (!doctorId) return null
  const tenant = await getTenant()
  if (!tenant) notFound()
  const db = tenantDb(tenant)

  const today = new Date()
  const { start: todayStart, end: todayEnd } = dayBoundsInTz(today, tenant.timezone)
  const weekEnd = dayBoundsInTz(new Date(today.getTime() + 7 * 86_400_000), tenant.timezone).end

  // Run queries
  const todayApptsSnap = await db.col('appointments')
    .where('doctorId', '==', doctorId)
    .where('status', '==', 'BOOKED')
    .where('startTime', '>=', todayStart)
    .orderBy('startTime', 'asc')
    .get()

  const upcomingApptsSnap = await db.col('appointments')
    .where('doctorId', '==', doctorId)
    .where('status', '==', 'BOOKED')
    .where('startTime', '>', todayEnd)
    .orderBy('startTime', 'asc')
    .limit(10)
    .get()

  const completedTodaySnap = await db.col('appointments')
    .where('doctorId', '==', doctorId)
    .where('status', '==', 'COMPLETED')
    .where('startTime', '>=', todayStart)
    .get()

  // Firestore only allows an inequality filter on one field, so blocks
  // starting before today (but still running into it, e.g. an overnight
  // block) are caught by filtering endTime in memory below.
  const blockedTodaySnap = await db.col('blocked_slots')
    .where('doctorId', '==', doctorId)
    .where('startTime', '<=', todayEnd)
    .get()

  const patientsCountSnap = await db.col('patients').count().get()
  const doctorDoc = await db.profile().get()

  // Process today's appointments (filter out beyond todayEnd, manually join relations)
  const todayApptsDocs = todayApptsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data(), startTime: doc.data().startTime?.toDate(), endTime: doc.data().endTime?.toDate() }))
    .filter((a: any) => a.startTime <= todayEnd)

  const todayAppts = await Promise.all(todayApptsDocs.map(async (apt: any) => {
    let patient = null
    let prescription = null
    let payment = null

    if (apt.patientId) {
      const pDoc = await db.col('patients').doc(apt.patientId).get()
      if (pDoc.exists) {
        const pd = pDoc.data() as any
        patient = { id: pDoc.id, name: pd.name, phone: pd.phone, dob: pd.dob?.toDate(), gender: pd.gender }
      }
    }

    const rxSnap = await db.col('prescriptions').where('appointmentId', '==', apt.id).limit(1).get()
    if (!rxSnap.empty) {
      prescription = { id: rxSnap.docs[0].id }
    }

    const paySnap = await db.col('payments').where('appointmentId', '==', apt.id).limit(1).get()
    if (!paySnap.empty) {
      payment = { id: paySnap.docs[0].id }
    }

    return { ...apt, patient, prescription, payment }
  }))

  // Process upcoming appointments
  const upcomingApptsDocs = upcomingApptsSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data(), startTime: doc.data().startTime?.toDate(), endTime: doc.data().endTime?.toDate() }))
    .filter((a: any) => a.startTime <= weekEnd)
    
  const upcomingAppts = await Promise.all(upcomingApptsDocs.map(async (apt: any) => {
    let patient = null
    if (apt.patientId) {
      const pDoc = await db.col('patients').doc(apt.patientId).get()
      if (pDoc.exists) patient = { id: pDoc.id, name: pDoc.data()?.name }
    }
    return { ...apt, patient }
  }))

  const completedTodayDocs = completedTodaySnap.docs
    .map((doc: any) => ({ startTime: doc.data().startTime?.toDate() }))
    .filter((a: any) => a.startTime <= todayEnd)

  const completedToday = completedTodayDocs.length

  const blockedToday = blockedTodaySnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data(), startTime: doc.data().startTime?.toDate(), endTime: doc.data().endTime?.toDate() }))
    .filter((b: any) => b.endTime >= todayStart)
    .sort((a: any, b: any) => a.startTime.getTime() - b.startTime.getTime())

  const totalPatients = patientsCountSnap.data().count
  const doctorProfile = doctorDoc.exists ? doctorDoc.data() : null

  const greeting = today.getHours() < 12 ? 'Morning' : today.getHours() < 17 ? 'Afternoon' : 'Evening'
  
  const rawName = doctorProfile?.name || session?.name || 'Doctor'
  const cleanName = rawName.replace(/^Dr\.?\s*/i, '')
  const firstName = cleanName.split(' ')[0]

  // Each card opens the list behind its number.
  const stats = [
    { label: "Today's Appointments", value: todayAppts.length, icon: Calendar, href: '#todays-schedule' },
    { label: 'Completed Today', value: completedToday, icon: CheckCircle2, href: '/doctor/calendar' },
    { label: 'Total Patients', value: totalPatients, icon: Users, href: '/doctor/patients' },
    { label: 'Upcoming (7 days)', value: upcomingAppts.length, icon: Clock, href: upcomingAppts.length > 0 ? '#upcoming' : '/doctor/calendar' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Greeting ─────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--color-sage-border)', paddingBottom: '20px' }}>
        <div className="flex items-center gap-4">
          {doctorProfile?.logoUrl && (
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1.5px solid var(--color-sage-border)' }}>
              <Image
                src={doctorProfile.logoUrl}
                alt={`${doctorProfile.clinicName ?? 'Clinic'} logo`}
                width={64}
                height={64}
                className="w-full h-full object-contain bg-white"
              />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--color-sage)', marginBottom: '2px' }}>
              {doctorProfile?.clinicName ?? 'Your Clinic'}
            </p>
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
        </div>
        {can(session?.role, 'prescriptions:manage') && (
          <div className="mt-4">
            <Link href="/doctor/quick-prescription" className="btn btn-primary w-full sm:w-auto">
              <FilePlus2 size={16} aria-hidden="true" /> Quick prescription
            </Link>
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-sage)' }}>A phone or video consultation: add the patient, write the medicines, send on WhatsApp.</p>
          </div>
        )}
      </div>

      {/* ── Stat Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="card-data p-4 block transition-shadow hover:shadow-md" aria-label={`${label}: ${value}`}>
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
          </Link>
        ))}
      </div>

      {/* ── Today's Schedule ─────────────────────────────── */}
      <div id="todays-schedule" className="card-data overflow-hidden scroll-mt-4">
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
            style={{ color: 'var(--color-link)' }}
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
            {todayAppts.map((appt: any, idx: number) => (
              // The whole row opens the visit (the name link stretches over it); Call and WhatsApp sit above that link.
              <div
                key={appt.id}
                className="relative flex items-center justify-between px-5 py-3.5 group transition-colors hover:bg-[var(--color-primary-bg)]"
                style={{
                  borderBottom: idx < todayAppts.length - 1 ? '1px solid var(--color-sage-border)' : 'none',
                }}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {/* Avatar — forest green, white initial */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--color-forest)' }}
                  >
                    {appt.patient?.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--color-charcoal)' }}>
                      <Link
                        // Straight to the job: the doctor writes the prescription, the front desk takes the payment
                        href={`/doctor/appointments/${appt.id}?tab=${can(session?.role, 'prescriptions:manage') ? 'prescription' : 'payment'}`}
                        className="after:absolute after:inset-0"
                      >
                        {appt.patient?.name ?? 'Unknown'}
                      </Link>
                      {ageSex(appt.patient?.dob, appt.patient?.gender, ymdInTz(today, tenant.timezone)) && (
                        <span className="font-normal" style={{ color: 'var(--color-sage)' }}> {ageSex(appt.patient?.dob, appt.patient?.gender, ymdInTz(today, tenant.timezone))}</span>
                      )}
                    </p>
                    <ContactButtons phone={appt.patient?.phone} name={appt.patient?.name} className="relative z-10 mt-1.5" />
                  </div>
                </div>
                <div className="text-right flex items-center gap-3 shrink-0 ml-3">
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Blocked Today ─────────────────────────────────── */}
      {blockedToday.length > 0 && (
        <div className="card-data overflow-hidden">
          <div
            className="flex justify-between items-center px-5 py-4"
            style={{ borderBottom: '1px solid var(--color-sage-border)' }}
          >
            <h2
              className="font-semibold text-base flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              <CalendarOff size={16} style={{ color: '#B54A3C' }} />
              Blocked Today
            </h2>
            <Link
              href="/doctor/blocked-slots"
              className="text-sm flex items-center gap-1 font-medium"
              style={{ color: 'var(--color-link)' }}
            >
              Manage <ChevronRight size={14} />
            </Link>
          </div>
          <div>
            {blockedToday.map((block: any, idx: number) => (
              <div
                key={block.id}
                className="flex items-center justify-between px-5 py-3.5"
                style={{
                  borderBottom: idx < blockedToday.length - 1 ? '1px solid var(--color-sage-border)' : 'none',
                }}
              >
                <div>
                  <p className="text-sm" style={{ color: 'var(--color-charcoal)' }}>
                    {block.reason || 'Blocked period'}
                  </p>
                  {isMultiDayBlock(block) && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-sage)' }}>
                      Multi-day: {formatDateOnly(block.startTime)} – {formatDateOnly(block.endTime)}
                    </p>
                  )}
                </div>
                <p className="text-sm font-medium font-tabular shrink-0 ml-3" style={{ color: '#B54A3C' }}>
                  {formatBlockRangeForDay(block, today)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upcoming appointments ────────────────────────── */}
      {upcomingAppts.length > 0 && (
        <div id="upcoming" className="card-data overflow-hidden scroll-mt-4">
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
            {upcomingAppts.map((appt: any, idx: number) => (
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
                    {appt.patient?.name ?? 'Unknown'}
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
