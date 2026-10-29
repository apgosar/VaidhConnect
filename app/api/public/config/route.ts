import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { NextResponse } from 'next/server'
import { ymdInTz } from '@/lib/time'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenant = await getTenant()
    if (!tenant) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
    const doctorDoc = await tenantDb(tenant).profile().get()

    if (!doctorDoc.exists) {
      return NextResponse.json({ error: 'Clinic not configured' }, { status: 404 })
    }

    const doctorData = doctorDoc.data()!

    // Return ONLY public safe configuration, not sensitive payment or password info
    const publicConfig = {
      enableChiefComplaint: doctorData.enableChiefComplaint ?? true,
      enableMedicalHistory: doctorData.enableMedicalHistory ?? true,
      // The clinic's own clock: date pickers and times must follow it, not the visitor's device.
      timezone: tenant.timezone,
      today: ymdInTz(new Date(), tenant.timezone),
    }

    return NextResponse.json({ config: publicConfig })
  } catch (error) {
    console.error('[public-config-get]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
