import { adminDb } from '@/lib/firebase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { phone, name, dob, medicalHistory, email } = body

    if (!phone || !name || !dob) {
      return Response.json({ error: 'Phone, name and date of birth are required' }, { status: 400 })
    }

    const normalized = phone.replace(/[\s\-()]/g, '')

    // Note: multiple patients (family members) can share a phone number — no uniqueness check

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

export async function PUT(request: Request) {
  try {
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
