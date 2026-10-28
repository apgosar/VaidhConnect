import type { MetadataRoute } from 'next'
import { getClinicProfile } from '@/lib/tenant/profile'
import { themeColorOf } from '@/lib/tenant/theme'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const clinic = await getClinicProfile()
  const name = clinic?.data.clinicName ?? 'Clinic'
  return {
    name,
    short_name: name.length > 12 ? name.split(' ')[0] : name,
    description: `Book appointments at ${name}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColorOf(clinic?.data.theme),
    icons: [{ src: '/api/clinic-icon', sizes: '192x192', type: 'image/png' }],
  }
}
