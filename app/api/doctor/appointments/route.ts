import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { forbid } from '@/lib/auth/access'
import { apiError } from '@/lib/errors'

// GET all doctor appointments (for calendar)
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const db = tenantDb(tenant)
    const session = await getSession()
    if (!session?.uid) {
      return apiError('UNAUTHORIZED')
    }
    const denied = forbid(session, 'appointments:manage')
    if (denied) return denied

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let query: any = db.col('appointments').where('doctorId', '==', tenant.clinicId)

    if (from) {
      query = query.where('startTime', '>=', new Date(from))
    }
    
    query = query.orderBy('startTime', 'asc')

    const snapshot = await query.get()
    
    let appointmentsDocs = snapshot.docs.map((doc: any) => {
      const data = doc.data()
      delete data.cancelTokenHash
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
        const pDoc = await db.col('patients').doc(apt.patientId).get()
        if (pDoc.exists) {
          const pd = pDoc.data() as any
          patient = { id: pDoc.id, name: pd.name, phone: pd.phone, dob: pd.dob?.toDate() }
        }
      }

      const rxSnap = await db.col('prescriptions').where('appointmentId', '==', apt.id).limit(1).get()
      if (!rxSnap.empty) {
        prescription = { id: rxSnap.docs[0].id }
      }

      const paySnap = await db.col('payments').where('appointmentId', '==', apt.id).limit(1).get()
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
    return apiError('SERVER_ERROR')
  }
}
