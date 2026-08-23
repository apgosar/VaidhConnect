import { adminDb } from '@/lib/firebase/server'
import { FieldValue } from 'firebase-admin/firestore'
import type { Metadata } from 'next'
import PatientPortal from '@/components/patient/PatientPortal'
import type { WeeklyTimings } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
  const doctor = doctorsSnap.empty ? null : doctorsSnap.docs[0].data() as any
  const appUrl = process.env.NEXTAUTH_URL ?? 'https://vaidhconnect-893037849130.asia-south1.run.app'
  const iconUrl = `${appUrl}/api/clinic-icon`
  const title = doctor?.clinicName ?? 'Clinic'
  const description = `Book appointments at ${title}${doctor?.address ? ` — ${doctor.address}` : ''}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: appUrl,
      images: [{ url: iconUrl, width: 512, height: 512, alt: `${title} logo` }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [iconUrl],
    },
  }
}

export default async function HomePage() {
  const doctorsSnap = await adminDb.collection('doctors').limit(1).get()

  if (doctorsSnap.empty) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Clinic Not Configured</h1>
          <p className="text-slate-500">Please contact the administrator to set up the clinic.</p>
        </div>
      </div>
    )
  }

  const doctorDoc = doctorsSnap.docs[0]
  const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

  // Increment page views in background
  adminDb.collection('doctors').doc(doctor.id).update({ 
    pageViews: FieldValue.increment(1) 
  }).catch(e => console.error('Failed to increment page views', e))

  return (
    <PatientPortal
      doctor={{
        ...doctor,
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
