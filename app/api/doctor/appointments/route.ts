import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

// GET all doctor appointments (for calendar)
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId: session.user.id,
        ...(from && to && {
          startTime: {
            gte: new Date(from),
            lte: new Date(to),
          },
        }),
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true, dob: true },
        },
        prescription: { select: { id: true } },
        payment: { select: { id: true, amount: true, mode: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    return Response.json({ appointments })
  } catch (error) {
    console.error('[doctor-appointments]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
