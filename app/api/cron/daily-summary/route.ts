import { adminDb } from '@/lib/firebase/server'
import { sendDailySummary } from '@/lib/whatsapp'
import { startOfDay, endOfDay, format } from 'date-fns'

// POST /api/cron/daily-summary
// Secured with a secret token
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET ?? 'dev-cron-secret'

    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
    if (doctorsSnap.empty) {
      return Response.json({ message: 'No doctor configured' })
    }
    
    const doctorDoc = doctorsSnap.docs[0]
    const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as any

    if (!doctor.phone) {
      return Response.json({ message: 'Doctor phone number not configured' })
    }

    const now = new Date()
    const start = startOfDay(now)
    const end = endOfDay(now)

    const appointmentsSnap = await adminDb.collection('appointments')
      .where('doctorId', '==', doctor.id)
      .where('status', '==', 'BOOKED')
      .where('startTime', '>=', start)
      .where('startTime', '<=', end)
      .orderBy('startTime', 'asc')
      .get()

    let scheduleList = ''
    for (const doc of appointmentsSnap.docs) {
      const apt = doc.data()
      if (apt.patientId) {
        const pDoc = await adminDb.collection('patients').doc(apt.patientId).get()
        const pName = pDoc.data()?.name || 'Unknown'
        const pPhone = pDoc.data()?.phone || 'Unknown'
        scheduleList += `${format(apt.startTime.toDate(), 'p')} - ${pName} - ${pPhone}\n`
      }
    }
    if (!scheduleList) scheduleList = 'No appointments scheduled for today.'

    await sendDailySummary(doctor.phone, {
      doctorName: doctor.name || 'Doctor',
      appointmentCount: appointmentsSnap.size.toString(),
      date: format(now, 'PPP'),
      scheduleList: scheduleList.trim()
    })

    return Response.json({ message: `Sent daily summary to doctor with ${appointmentsSnap.size} appointments.` })
  } catch (error) {
    console.error('[cron-daily-summary]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
