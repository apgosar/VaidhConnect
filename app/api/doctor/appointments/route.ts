import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'

// GET all doctor appointments (for calendar)
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let query: any = adminDb.collection('appointments').where('doctorId', '==', session.uid)

    if (from) {
      query = query.where('startTime', '>=', new Date(from))
    }
    
    query = query.orderBy('startTime', 'asc')

    const snapshot = await query.get()
    
    let appointmentsDocs = snapshot.docs.map((doc: any) => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        startTime: data.startTime?.toDate(),
        endTime: data.endTime?.toDate(),
      }
    })

    if (to) {
      const toDate = new Date(to)
      appointmentsDocs = appointmentsDocs.filter((a: any) => a.endTime <= toDate)
    }

    // Resolve relations manually
    const appointments = await Promise.all(appointmentsDocs.map(async (apt: any) => {
      let patient = null
      let prescription = null
      let payment = null

      if (apt.patientId) {
        const pDoc = await adminDb.collection('patients').doc(apt.patientId).get()
        if (pDoc.exists) {
          const pd = pDoc.data() as any
          patient = { id: pDoc.id, name: pd.name, phone: pd.phone, dob: pd.dob?.toDate() }
        }
      }

      const rxSnap = await adminDb.collection('prescriptions').where('appointmentId', '==', apt.id).limit(1).get()
      if (!rxSnap.empty) {
        prescription = { id: rxSnap.docs[0].id }
      }

      const paySnap = await adminDb.collection('payments').where('appointmentId', '==', apt.id).limit(1).get()
      if (!paySnap.empty) {
        const pd = paySnap.docs[0].data()
        payment = { id: paySnap.docs[0].id, amount: pd.amount, mode: pd.mode }
      }

      return {
        ...apt,
        patient,
        prescription,
        payment,
      }
    }))

    return Response.json({ appointments })
  } catch (error) {
    console.error('[doctor-appointments]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
