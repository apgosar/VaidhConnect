import { adminDb } from '@/lib/firebase/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')
    const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : 20
    const skip = (page - 1) * limit

    const patientsSnap = await adminDb.collection('patients').orderBy('createdAt', 'desc').get()
    
    let allPatients = patientsSnap.docs.map((doc: any) => {
      const data = doc.data()
      return {
        id: doc.id,
        name: data.name,
        phone: data.phone,
        dob: data.dob?.toDate(),
        medicalHistory: data.medicalHistory,
        email: data.email,
        _count: { appointments: 0 }, // Simplified since Firestore doesn't have relation counts easily
      }
    })

    if (q && q.length >= 2) {
      const lowerQ = q.toLowerCase()
      allPatients = allPatients.filter((p: any) => 
        (p.name && p.name.toLowerCase().includes(lowerQ)) || 
        (p.phone && p.phone.includes(q))
      )
    }

    const total = allPatients.length
    const paginatedPatients = allPatients.slice(skip, skip + limit)

    return Response.json({ patients: paginatedPatients, total })
  } catch (error) {
    console.error('[patient-search]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
