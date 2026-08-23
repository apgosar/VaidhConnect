import { adminDb } from '@/lib/firebase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Phone, Calendar, FileText, CreditCard, ChevronRight } from 'lucide-react'
import { computeAge, formatDate } from '@/lib/slots'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const patientDoc = await adminDb.collection('patients').doc(id).get()
  return { title: patientDoc.exists ? patientDoc.data()?.name : 'Patient' }
}

export default async function PatientHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patientDoc = await adminDb.collection('patients').doc(id).get()

  if (!patientDoc.exists) notFound()
  
  const patientData = patientDoc.data() as any
  const patient = {
    id: patientDoc.id,
    ...patientData,
    dob: patientData.dob?.toDate(),
  }

  // Fetch appointments
  const appointmentsSnap = await adminDb.collection('appointments')
    .where('patientId', '==', id)
    .orderBy('startTime', 'desc')
    .get()

  const appointments = await Promise.all(appointmentsSnap.docs.map(async doc => {
    const aptData = doc.data()
    const apt = {
      id: doc.id,
      ...aptData,
      startTime: aptData.startTime?.toDate(),
      endTime: aptData.endTime?.toDate(),
    } as any

    // Fetch related prescription
    const rxSnap = await adminDb.collection('prescriptions').where('appointmentId', '==', doc.id).limit(1).get()
    if (!rxSnap.empty) {
      const rx = rxSnap.docs[0].data()
      apt.prescription = { id: rxSnap.docs[0].id, diagnosis: rx.diagnosis, pdfPath: rx.pdfPath }
    } else {
      apt.prescription = null
    }

    // Fetch related payment
    const paySnap = await adminDb.collection('payments').where('appointmentId', '==', doc.id).limit(1).get()
    if (!paySnap.empty) {
      const pay = paySnap.docs[0].data()
      apt.payment = { id: paySnap.docs[0].id, amount: pay.amount, mode: pay.mode, paidAt: pay.paidAt?.toDate() }
    } else {
      apt.payment = null
    }

    return apt
  }))
  
  patient.appointments = appointments

  const age = computeAge(patient.dob)
  const formatPatientId = (id: string) => `PAT-${id.slice(-6).toUpperCase()}`

  return (
    <div className="space-y-5 max-w-3xl animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/doctor/patients" className="btn btn-ghost p-2 -ml-2 mt-1" style={{ color: 'var(--color-sage)' }}>
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ background: 'var(--color-forest)' }}
            >
              {patient.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>
                  {patient.name}
                </h1>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full font-tabular tracking-wide"
                  style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)' }}
                >
                  {formatPatientId(patient.id)}
                </span>
              </div>
              <p className="text-sm font-tabular mt-0.5" style={{ color: 'var(--color-sage)' }}>{age} years · {patient.phone}</p>
              {patient.email && <p className="text-xs mt-0.5" style={{ color: 'var(--color-sage-light)' }}>{patient.email}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Medical History */}
      {patient.medicalHistory && (
        <div className="card-data p-5">
          <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-charcoal)' }}>Medical History</h3>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-sage)' }}>{patient.medicalHistory}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-data p-4 text-center">
          <p className="text-2xl font-bold font-tabular" style={{ color: 'var(--color-charcoal)' }}>{patient.appointments.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Total Visits</p>
        </div>
        <div className="card-data p-4 text-center">
          <p className="text-2xl font-bold font-tabular" style={{ color: 'var(--color-charcoal)' }}>
            {patient.appointments.filter((a: any) => a.prescription).length}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Prescriptions</p>
        </div>
        <div className="card-data p-4 text-center">
          <p className="text-2xl font-bold font-tabular" style={{ color: 'var(--color-charcoal)' }}>
            ₹{patient.appointments.reduce((sum: number, a: any) => sum + Number(a.payment?.amount ?? 0), 0).toLocaleString()}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>Total Paid</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--color-charcoal)' }}>Appointment History</h2>
        {patient.appointments.length === 0 ? (
          <div className="text-center py-8">
            <Calendar size={32} className="mx-auto mb-2" style={{ color: 'var(--color-sage-light)' }} />
            <p className="text-sm" style={{ color: 'var(--color-sage)' }}>No appointments yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {patient.appointments.map((appt: any) => (
              <Link
                key={appt.id}
                href={`/doctor/appointments/${appt.id}`}
                className="card-data p-4 flex items-start justify-between gap-3 transition-colors hover:bg-[var(--color-primary-bg)] group"
              >
                <div className="flex gap-3">
                  <div className="mt-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: appt.status === 'COMPLETED' ? 'var(--color-pine)' :
                                    appt.status === 'CANCELLED' ? '#B54A3C' : 'var(--color-gold-dark)'
                      }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm font-tabular" style={{ color: 'var(--color-charcoal)' }}>{formatDate(appt.startTime)}</p>
                    {appt.chiefComplaint && <p className="text-xs mt-0.5" style={{ color: 'var(--color-sage)' }}>{appt.chiefComplaint}</p>}
                    <div className="flex gap-2 mt-1.5">
                      <span className={`status-${appt.status.toLowerCase()}`}>{appt.status}</span>
                      {appt.prescription && (
                        <span className="badge badge-green text-xs flex items-center gap-1" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)', border: 'none' }}>
                          <FileText size={10} /> {appt.prescription.diagnosis ?? 'Rx'}
                        </span>
                      )}
                      {appt.payment && (
                        <span className="badge badge-blue text-xs flex items-center gap-1" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)', border: 'none' }}>
                          <CreditCard size={10} /> ₹{Number(appt.payment.amount).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 mt-1 transition-colors" style={{ color: 'var(--color-sage-light)' }} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
