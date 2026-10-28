import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
﻿import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const q = request.nextUrl.searchParams.get('q')
    const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : 20
    const skip = (page - 1) * limit

    const patientsSnap = await db.col('patients').orderBy('createdAt', 'desc').get()
    
    let allPatients = patientsSnap.docs.map((doc: any) => {
      const data = doc.data()
      return {
        id: doc.id,
        name: data.name,
        phone: data.phone,
        dob: data.dob?.toDate(),
        medicalHistory: data.medicalHistory,
        email: data.email,
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
    const pageSlice = allPatients.slice(skip, skip + limit)

    // Aggregation count query, not a full fetch â€” cheap even with many
    // appointments, and only run for the page actually being returned.
    const paginatedPatients = await Promise.all(pageSlice.map(async (p: any) => {
      const countSnap = await db.col('appointments').where('patientId', '==', p.id).count().get()
      return { ...p, _count: { appointments: countSnap.data().count } }
    }))

    return Response.json({ patients: paginatedPatients, total })
  } catch (error) {
    console.error('[patient-search]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
