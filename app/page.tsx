import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import PatientPortal from '@/components/patient/PatientPortal'
import type { WeeklyTimings } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const doctor = await prisma.doctor.findFirst({ select: { clinicName: true, specialty: true, address: true } })
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
  const doctor = await prisma.doctor.findFirst({
    select: {
      id: true,
      name: true,
      clinicName: true,
      logoUrl: true,
      address: true,
      mapsUrl: true,
      phone: true,
      specialty: true,
      themeColor: true,
      qualifications: true,
      timings: true,
      slotDurationMins: true,
    },
  })

  if (!doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Clinic Not Configured</h1>
          <p className="text-slate-500">Please contact the administrator to set up the clinic.</p>
        </div>
      </div>
    )
  }

  return (
    <PatientPortal
      doctor={{
        ...doctor,
        logoUrl: doctor.logoUrl ?? null,
        address: doctor.address ?? null,
        mapsUrl: doctor.mapsUrl ?? null,
        phone: doctor.phone ?? null,
        qualifications: doctor.qualifications ?? null,
        timings: doctor.timings as unknown as WeeklyTimings,
      }}
    />
  )
}
