import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { adminDb } from '@/lib/firebase/server'
import { getPatientSession } from '@/lib/auth/patientSession'

// GET /api/patients/lookup — returns every patient record linked to the
// CALLER'S OWN verified phone number (family members share a number).
// No phone parameter is accepted: the number always comes from the
// verified OTP session, never from client input.
export async function GET() {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const session = await getPatientSession()
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const normalized = session.phoneNumber.replace(/[\s\-()]/g, '')

    const patientsSnap = await db.col('patients')
      .where('phone', '==', normalized)
      .orderBy('createdAt', 'asc')
      .get()

    if (patientsSnap.empty) {
      return Response.json({ found: false })
    }

    const patients = await Promise.all(patientsSnap.docs.map(async (doc) => {
      const data = doc.data()

      // Fetch upcoming appointments manually
      const appointmentsSnap = await db.col('appointments')
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

    // Deduplicate in case there are legacy duplicate records with same name and DOB
    const uniquePatients: any[] = []
    const seen = new Set<string>()

    for (const p of patients) {
      const nameKey = p.name?.trim().toLowerCase()
      const dobKey = p.dob ? new Date(p.dob).toISOString().split('T')[0] : ''
      const key = `${nameKey}_${dobKey}`

      if (!seen.has(key)) {
        seen.add(key)
        uniquePatients.push(p)
      } else {
        // If it's a duplicate, we can merge appointments so they don't get lost
        const existing = uniquePatients.find(up => up.name?.trim().toLowerCase() === nameKey && (up.dob ? new Date(up.dob).toISOString().split('T')[0] : '') === dobKey)
        if (existing && p.appointments.length > 0) {
          existing.appointments = [...existing.appointments, ...p.appointments]
          // Sort merged appointments by startTime and take top 5
          existing.appointments.sort((a: any, b: any) => a.startTime.getTime() - b.startTime.getTime())
          existing.appointments = existing.appointments.slice(0, 5)
        }
      }
    }

    return Response.json({ found: true, patients: uniquePatients })
  } catch (error) {
    console.error('[patient-lookup]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
