import { adminDb } from '@/lib/firebase/server'
import { sendDailySummary } from '@/lib/whatsapp'
import { startOfDay, endOfDay, format } from 'date-fns'

// POST /api/cron/daily-summary
// Secured with a secret token. Called every hour by a cron scheduler.
// The doctor configures which hour they want the summary (summaryHour, default 10 = 10am).
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

    // Use whatsappPhone for private notifications; fall back to clinic phone
    const notifyPhone = (doctor.whatsappPhone as string | undefined)?.trim() || (doctor.phone as string | undefined)?.trim()
    if (!notifyPhone) {
      return Response.json({ message: 'Doctor phone number not configured' })
    }

    // Check if it is the configured summary hour (default 10 = 10am)
    const summaryHour: number = typeof doctor.summaryHour === 'number' ? doctor.summaryHour : 10
    const now = new Date()
    if (now.getHours() !== summaryHour) {
      return Response.json({ message: `Not summary time yet. Configured hour: ${summaryHour}, current hour: ${now.getHours()}` })
    }

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
        const pPhone = pDoc.data()?.phone || ''
        scheduleList += `${format(apt.startTime.toDate(), 'p')} - ${pName} - ${pPhone}\n`
      }
    }
    if (!scheduleList) scheduleList = 'No appointments scheduled for today.'

    await sendDailySummary(notifyPhone, {
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
