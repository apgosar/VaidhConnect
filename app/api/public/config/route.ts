import { adminDb } from '@/lib/firebase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
    
    if (doctorsSnap.empty) {
      return NextResponse.json({ error: 'Clinic not configured' }, { status: 404 })
    }

    const doctorData = doctorsSnap.docs[0].data()

    // Return ONLY public safe configuration, not sensitive payment or password info
    const publicConfig = {
      enableChiefComplaint: doctorData.enableChiefComplaint ?? true,
      enableMedicalHistory: doctorData.enableMedicalHistory ?? true,
    }

    return NextResponse.json({ config: publicConfig })
  } catch (error) {
    console.error('[public-config-get]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
