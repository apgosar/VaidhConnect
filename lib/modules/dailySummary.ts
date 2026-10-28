import { tenantDb } from '../db/tenant'
import { sendDailySummary } from '../whatsapp'
import { dayBoundsInTz, formatDateLongInTz, formatTimeInTz, hourInTz, ymdInTz } from '../time'
import type { Tenant } from '../tenant/types'

/** How many hours after summaryHour a missed tick may still send the summary. */
const CATCH_UP_HOURS = 2

export type SummaryOutcome = 'sent' | 'not-due' | 'already-sent' | 'no-phone' | 'no-clinic'

/**
 * Send the doctor's morning summary for ONE clinic, in the clinic's own
 * timezone, at most once per local day. A skipped scheduler tick is caught up
 * within CATCH_UP_HOURS instead of silently losing the day.
 */
export async function processDailySummary(tenant: Tenant, now = new Date()): Promise<SummaryOutcome> {
  const db = tenantDb(tenant)
  const profileSnap = await db.profile().get()
  if (!profileSnap.exists) return 'no-clinic'
  const doctor = { id: profileSnap.id, ...profileSnap.data() } as any

  const notifyPhone = (doctor.whatsappPhone as string | undefined)?.trim() || (doctor.phone as string | undefined)?.trim()
  if (!notifyPhone) return 'no-phone'

  const summaryHour: number = typeof doctor.summaryHour === 'number' ? doctor.summaryHour : 10
  const hour = hourInTz(now, tenant.timezone)
  if (hour < summaryHour || hour > summaryHour + CATCH_UP_HOURS) return 'not-due'

  const today = ymdInTz(now, tenant.timezone)
  if (doctor.lastDailySummaryOn === today) return 'already-sent'

  const { start, end } = dayBoundsInTz(now, tenant.timezone)
  const snap = await db.col('appointments')
    .where('doctorId', '==', doctor.id)
    .where('status', '==', 'BOOKED')
    .where('startTime', '>=', start)
    .where('startTime', '<=', end)
    .orderBy('startTime', 'asc')
    .get()

  const patientDocs = await Promise.all(
    snap.docs.map(d => d.data().patientId ? db.col('patients').doc(d.data().patientId).get() : null),
  )
  let scheduleList = ''
  snap.docs.forEach((d, i) => {
    const p = patientDocs[i]
    if (!p) return
    scheduleList += `${formatTimeInTz(d.data().startTime.toDate(), tenant.timezone)} - ${p.data()?.name || 'Unknown'} - ${p.data()?.phone || ''}\n`
  })
  if (!scheduleList) scheduleList = 'No appointments scheduled for today.'

  const ok = await sendDailySummary(notifyPhone, {
    doctorName: doctor.name || 'Doctor',
    appointmentCount: snap.size.toString(),
    date: formatDateLongInTz(now, tenant.timezone),
    scheduleList: scheduleList.trim(),
  })
  if (!ok) throw new Error('WhatsApp send failed')

  // Marker written only after a successful send, so a failure retries on the next tick.
  await db.profile().update({ lastDailySummaryOn: today })
  return 'sent'
}
