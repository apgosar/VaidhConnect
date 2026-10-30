import { cronAuthorized, runForAllClinics } from '@/lib/cron'
import { processDailySummary } from '@/lib/modules/dailySummary'
import { apiError } from '@/lib/errors'

// POST /api/cron/daily-summary — called hourly by Cloud Scheduler.
// Each clinic decides for itself, in its own timezone, whether it is due.
export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return apiError('UNAUTHORIZED')
  }
  const summary = await runForAllClinics(tenant => processDailySummary(tenant))
  return Response.json(summary, { status: summary.failed ? 207 : 200 })
}
