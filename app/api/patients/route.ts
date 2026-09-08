import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { getPatientSession } from '@/lib/auth/patientSession'

// POST — patient self-registration from the public booking portal.
// Requires a verified OTP session. The phone number is ALWAYS taken from
// that session, never from the request body — so a verified caller can
// only ever create or claim records under their own number, regardless
// of what they put in the form.
export async function POST(request: Request) {
  try {
    const patientSession = await getPatientSession()
    if (!patientSession) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, dob, medicalHistory, email } = body

    if (!name || !dob) {
      return Response.json({ error: 'Name and date of birth are required' }, { status: 400 })
    }

    const normalized = patientSession.phoneNumber.replace(/[\s\-()]/g, '')

    // Find or create: Check if patient with same phone, name, and DOB already exists
    const existingSnap = await adminDb.collection('patients').where('phone', '==', normalized).get()
    
    let existingPatient = null
    const targetDobStr = new Date(dob).toISOString().split('T')[0]
    const targetNameStr = name.trim().toLowerCase()

    for (const doc of existingSnap.docs) {
      const data = doc.data()
      const docNameStr = data.name?.trim().toLowerCase()
      const docDobStr = data.dob?.toDate().toISOString().split('T')[0]
      
      if (docNameStr === targetNameStr && docDobStr === targetDobStr) {
        existingPatient = { id: doc.id, ...data }
        break
      }
    }

    if (existingPatient) {
      // Update medical history if provided and return existing patient
      const updateData: any = { updatedAt: new Date() }
      if (medicalHistory !== undefined && medicalHistory.trim() !== '') {
        updateData.medicalHistory = medicalHistory.trim()
      }
      if (email !== undefined && email.trim() !== '') {
        updateData.email = email.trim()
      }
      
      if (Object.keys(updateData).length > 1) {
        await adminDb.collection('patients').doc(existingPatient.id).update(updateData)
      }
      
      return Response.json({ patient: existingPatient }, { status: 200 })
    }

    const patientData = {
      phone: normalized,
      name: name.trim(),
      dob: new Date(dob),
      medicalHistory: medicalHistory?.trim() || null,
      email: email?.trim() || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const newPatientRef = adminDb.collection('patients').doc()
    await newPatientRef.set(patientData)

    const patient = {
      id: newPatientRef.id,
      ...patientData
    }

    return Response.json({ patient }, { status: 201 })
  } catch (error) {
    console.error('[patient-register]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — edit a patient's record. Doctor-only: there is currently no
// caller for this from the public patient portal.
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, dob, medicalHistory, email } = body

    if (!id) {
      return Response.json({ error: 'Patient ID required' }, { status: 400 })
    }

    const patientRef = adminDb.collection('patients').doc(id)
    const patientDoc = await patientRef.get()

    if (!patientDoc.exists) {
      return Response.json({ error: 'Patient not found' }, { status: 404 })
    }

    const updateData: any = { updatedAt: new Date() }
    if (name) updateData.name = name.trim()
    if (dob) updateData.dob = new Date(dob)
    if (medicalHistory !== undefined) updateData.medicalHistory = medicalHistory?.trim() || null
    if (email !== undefined) updateData.email = email?.trim() || null

    await patientRef.update(updateData)

    const updatedDoc = await patientRef.get()
    const pData = updatedDoc.data() as any
    const patient = {
      id: updatedDoc.id,
      ...pData,
      dob: pData.dob?.toDate(),
    }

    return Response.json({ patient })
  } catch (error) {
    console.error('[patient-update]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
