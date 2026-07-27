import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { phone, name, dob, medicalHistory, email, chiefComplaint } = body

    if (!phone || !name || !dob) {
      return Response.json({ error: 'Phone, name and date of birth are required' }, { status: 400 })
    }

    const normalized = phone.replace(/[\s\-()]/g, '')

    // Note: multiple patients (family members) can share a phone number — no uniqueness check

    const patient = await prisma.patient.create({
      data: {
        phone: normalized,
        name: name.trim(),
        dob: new Date(dob),
        medicalHistory: medicalHistory?.trim() || null,
        email: email?.trim() || null,
      },
    })

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

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(dob && { dob: new Date(dob) }),
        ...(medicalHistory !== undefined && { medicalHistory: medicalHistory?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
      },
    })

    return Response.json({ patient })
  } catch (error) {
    console.error('[patient-update]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
