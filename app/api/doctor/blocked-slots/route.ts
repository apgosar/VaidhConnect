import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

// GET blocked slots
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const blocks = await prisma.blockedSlot.findMany({
      where: {
        doctorId: session.user.id,
        ...(from && to && {
          startTime: { gte: new Date(from) },
          endTime: { lte: new Date(to) },
        }),
      },
      orderBy: { startTime: 'asc' },
    })

    return Response.json({ blocks })
  } catch (error) {
    console.error('[blocked-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a blocked slot
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { startTime, endTime, reason } = await request.json()

    if (!startTime || !endTime) {
      return Response.json({ error: 'startTime and endTime are required' }, { status: 400 })
    }

    const block = await prisma.blockedSlot.create({
      data: {
        doctorId: session.user.id,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        reason: reason?.trim() || null,
      },
    })

    return Response.json({ block }, { status: 201 })
  } catch (error) {
    console.error('[blocked-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a blocked slot
export async function DELETE(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await request.json()
    if (!id) {
      return Response.json({ error: 'Block ID required' }, { status: 400 })
    }

    const block = await prisma.blockedSlot.findUnique({ where: { id } })
    if (!block || block.doctorId !== session.user.id) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.blockedSlot.delete({ where: { id } })
    return Response.json({ message: 'Deleted' })
  } catch (error) {
    console.error('[blocked-delete]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
