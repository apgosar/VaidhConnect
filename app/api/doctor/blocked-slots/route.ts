import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'

// GET blocked slots
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let query: any = adminDb.collection('blocked_slots').where('doctorId', '==', session.uid)

    if (from) {
      query = query.where('startTime', '>=', new Date(from))
    }
    
    // Firestore only supports inequality filters on a single field, 
    // so we sort by startTime and fetch, then filter 'to' in memory if needed.
    query = query.orderBy('startTime', 'asc')

    const snapshot = await query.get()
    
    let blocks = snapshot.docs.map((doc: any) => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        startTime: data.startTime?.toDate(),
        endTime: data.endTime?.toDate(),
      }
    })

    if (to) {
      const toDate = new Date(to)
      blocks = blocks.filter((b: any) => b.endTime <= toDate)
    }

    return Response.json({ blocks })
  } catch (error) {
    console.error('[blocked-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a blocked slot
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { startTime, endTime, reason } = await request.json()

    if (!startTime || !endTime) {
      return Response.json({ error: 'startTime and endTime are required' }, { status: 400 })
    }

    const newBlockRef = adminDb.collection('blocked_slots').doc()
    const blockData = {
      doctorId: session.uid,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      reason: reason?.trim() || null,
      createdAt: new Date(),
    }

    await newBlockRef.set(blockData)

    return Response.json({ block: { id: newBlockRef.id, ...blockData } }, { status: 201 })
  } catch (error) {
    console.error('[blocked-post]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a blocked slot
export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await request.json()
    if (!id) {
      return Response.json({ error: 'Block ID required' }, { status: 400 })
    }

    const blockRef = adminDb.collection('blocked_slots').doc(id)
    const blockDoc = await blockRef.get()

    if (!blockDoc.exists || blockDoc.data()?.doctorId !== session.uid) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    await blockRef.delete()
    return Response.json({ message: 'Deleted' })
  } catch (error) {
    console.error('[blocked-delete]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
