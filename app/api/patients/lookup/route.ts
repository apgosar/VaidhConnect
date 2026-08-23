import { adminDb } from '@/lib/firebase/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const phone = request.nextUrl.searchParams.get('phone')

    if (!phone) {
      return Response.json({ error: 'Phone number required' }, { status: 400 })
    }

    // Normalize phone: strip spaces and dashes
    const normalized = phone.replace(/[\s\-()]/g, '')

    // Return ALL patients linked to this phone number (family members)
    const patientsSnap = await adminDb.collection('patients')
      .where('phone', '==', normalized)
      .orderBy('createdAt', 'asc')
      .get()

    if (patientsSnap.empty) {
      return Response.json({ found: false })
    }

    const patients = await Promise.all(patientsSnap.docs.map(async (doc) => {
      const data = doc.data()
      
      // Fetch upcoming appointments manually
      const appointmentsSnap = await adminDb.collection('appointments')
        .where('patientId', '==', doc.id)
        .where('status', '==', 'BOOKED')
        .where('startTime', '>=', new Date())
        .orderBy('startTime', 'asc')
        .limit(5)
        .get()
        
      const appointments = appointmentsSnap.docs.map((aptDoc: any) => {
        const aptData = aptDoc.data()
        return {
          id: aptDoc.id,
          startTime: aptData.startTime?.toDate(),
          endTime: aptData.endTime?.toDate(),
          status: aptData.status,
          chiefComplaint: aptData.chiefComplaint,
        }
      })

      return {
        id: doc.id,
        name: data.name,
        phone: data.phone,
        dob: data.dob?.toDate(),
        medicalHistory: data.medicalHistory,
        email: data.email,
        appointments,
      }
    }))

    return Response.json({ found: true, patients })
  } catch (error) {
    console.error('[patient-lookup]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
