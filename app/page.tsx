import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { FieldValue } from 'firebase-admin/firestore'
import PatientPortal from '@/components/patient/PatientPortal'
import type { WeeklyTimings } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const tenant = await getTenant()
  const doctorDoc = tenant ? await tenantDb(tenant).profile().get() : null

  if (!tenant || !doctorDoc?.exists) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Clinic Not Configured</h1>
          <p className="text-slate-500">Please contact the administrator to set up the clinic.</p>
        </div>
      </div>
    )
  }

  const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

  // Increment page views in background
  tenantDb(tenant).profile().update({ 
    pageViews: FieldValue.increment(1) 
  }).catch(e => console.error('Failed to increment page views', e))

  return (
    <PatientPortal
      // Explicit whitelist: this crosses into a Client Component, so everything
      // here is sent to the visitor's browser. Never spread the raw profile —
      // it holds private fields (whatsappPhone, email, ownerUid, flags) and
      // Firestore Timestamps, which can't be serialized.
      doctor={{
        id: doctor.id,
        name: doctor.name,
        clinicName: doctor.clinicName,
        specialty: doctor.specialty,
        themeColor: doctor.themeColor ?? '',
        slotDurationMins: doctor.slotDurationMins,
        consultationFee: doctor.consultationFee ?? null,
        followUpFee: doctor.followUpFee ?? null,
        logoUrl: doctor.logoUrl ?? null,
        address: doctor.address ?? null,
        mapsUrl: doctor.mapsUrl ?? null,
        phone: doctor.phone ?? null,
        qualifications: doctor.qualifications ?? null,
        practiceDescription: doctor.practiceDescription ?? null,
        photoUrl: doctor.photoUrl ?? null,
        registrationNumber: doctor.registrationNumber,
        youtubeLinks: (doctor.youtubeLinks as string[]) ?? [],
        products: (doctor.products as any[]) ?? [],
        pageViews: doctor.pageViews ?? 0,
        paymentDetails: doctor.paymentDetails as any,
        timings: doctor.timings as unknown as WeeklyTimings,
      }}
    />
  )
}
