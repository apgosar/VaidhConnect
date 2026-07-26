import { prisma } from '@/lib/prisma'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const phone = request.nextUrl.searchParams.get('phone')

    if (!phone) {
      return Response.json({ error: 'Phone number required' }, { status: 400 })
    }

    // Normalize phone: strip spaces and dashes
    const normalized = phone.replace(/[\s\-()]/g, '')

    const patient = await prisma.patient.findUnique({
      where: { phone: normalized },
      select: {
        id: true,
        name: true,
        phone: true,
        dob: true,
        medicalHistory: true,
        email: true,
        appointments: {
          where: {
            status: 'BOOKED',
            startTime: { gte: new Date() },
          },
          orderBy: { startTime: 'asc' },
          take: 5,
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            chiefComplaint: true,
          },
        },
      },
    })

    if (!patient) {
      return Response.json({ found: false })
    }

    return Response.json({ found: true, patient })
  } catch (error) {
    console.error('[patient-lookup]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
