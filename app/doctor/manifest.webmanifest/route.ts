import { getClinicProfile } from '@/lib/tenant/profile'
import { themeColorOf } from '@/lib/tenant/theme'

export const dynamic = 'force-dynamic'

/**
 * The doctor and staff app, installable on its own from any /doctor page (linked by app/doctor/layout.tsx).
 * Its own id, scope and start page are what keep it separate from the patient app installed from the landing page.
 */
export async function GET() {
  const clinic = await getClinicProfile()
  const name = clinic?.data.clinicName ?? 'Clinic'
  const first = name.split(' ')[0]
  return Response.json({
    id: '/doctor',
    name: `${name} - Doctor`,
    short_name: `${first.length > 9 ? first.slice(0, 9) : first} Dr`,
    description: `Appointments and prescriptions for ${name}`,
    start_url: '/doctor/dashboard',
    scope: '/doctor',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColorOf(clinic?.data.theme),
    icons: [{ src: '/api/clinic-icon', sizes: '192x192', type: 'image/png' }],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'private, max-age=300' } })
}
