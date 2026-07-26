import { prisma } from '@/lib/prisma'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')
    const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : 20
    const skip = (page - 1) * limit

    const whereClause = (q && q.length >= 2) ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q } },
      ],
    } : {}

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          phone: true,
          dob: true,
          medicalHistory: true,
          email: true,
          _count: { select: { appointments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.patient.count({
        where: whereClause,
      }),
    ])

    return Response.json({ patients, total })
  } catch (error) {
    console.error('[patient-search]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
