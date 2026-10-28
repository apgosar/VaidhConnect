import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
﻿import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'

// GET blocked slots
export async function GET(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let query: any = db.col('blocked_slots').where('doctorId', '==', session.uid)

    // This needs an OVERLAP query ("covers some part of [from, to]"), not
    // "starts within [from, to]" â€” otherwise a multi-day block that
    // started before `from` (e.g. last week, still running) silently
    // disappears from this week's view. Firestore only allows an
    // inequality filter on one field, so we filter startTime <= to here
    // and endTime >= from in memory below.
    if (to) {
      query = query.where('startTime', '<=', new Date(to))
    }

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

    if (from) {
      const fromDate = new Date(from)
      blocks = blocks.filter((b: any) => b.endTime >= fromDate)
    }

    return Response.json({ blocks })
  } catch (error) {
    console.error('[blocked-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST â€” create a blocked slot
export async function POST(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { startTime, endTime, reason } = await request.json()

    if (!startTime || !endTime) {
      return Response.json({ error: 'startTime and endTime are required' }, { status: 400 })
    }

    const newBlockRef = db.col('blocked_slots').doc()
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

// DELETE â€” remove a blocked slot
export async function DELETE(request: Request) {
  try {
    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const db = tenantDb(tenant)
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await request.json()
    if (!id) {
      return Response.json({ error: 'Block ID required' }, { status: 400 })
    }

    const blockRef = db.col('blocked_slots').doc(id)
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
