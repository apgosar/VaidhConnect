import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/tenant/profile', () => ({ getClinicProfile: async () => ({ data: { clinicName: 'Shah Family Clinic', theme: undefined } }) }))

import { GET } from '@/app/doctor/manifest.webmanifest/route'
import manifest from '@/app/manifest'

describe('the two installable apps', () => {
  it('the doctor app starts on the dashboard, in its own scope and id', async () => {
    const m = await (await GET()).json()
    expect(m).toMatchObject({ id: '/doctor', scope: '/doctor', start_url: '/doctor/dashboard', display: 'standalone', name: 'Shah Family Clinic - Doctor' })
  })

  it('the patient app is still the landing page, with a different id', async () => {
    const m = await manifest()
    expect(m).toMatchObject({ id: '/', start_url: '/' })
  })
})
