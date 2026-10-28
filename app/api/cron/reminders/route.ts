import { cronAuthorized, runForAllClinics } from '@/lib/cron'
import { processReminders } from '@/lib/modules/reminders'

// POST /api/cron/reminders — called by Cloud Scheduler every 15 minutes.
// Fans out to every clinic; bearer-secured, and rejects everything if
// CRON_SECRET is unset (no fallback value).
export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const summary = await runForAllClinics(tenant => processReminders(tenant))
  return Response.json(summary, { status: summary.failed ? 207 : 200 })
}
