// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'a1' }), useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))

import AppointmentView from '@/app/doctor/(protected)/appointments/[id]/AppointmentView'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Editing the patient from the appointment page', () => {
  it('fixes the name, saves, and shows the corrected name', async () => {
    let name = 'Asha Rau'
    const puts: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/appointments/a1') return Response.json({ appointment: {
        id: 'a1', startTime: '2026-11-05T04:30:00.000Z', endTime: '2026-11-05T04:45:00.000Z', status: 'BOOKED',
        patient: { id: 'p1', name, phone: '+919800000001', dob: '1990-06-01T00:00:00.000Z', dobApproximate: true, gender: 'FEMALE' },
      } })
      if (url === '/api/patients' && init?.method === 'PUT') { puts.push(JSON.parse(init.body as string)); name = puts[0].name; return Response.json({ ok: true }) }
      if (url === '/api/doctor/profile') return Response.json({ doctor: {} })
      if (url.endsWith('/rx-scans')) return Response.json({ scans: [] })
      if (url.startsWith('/api/prescriptions/medicines')) return Response.json({ medicines: [] })
      throw new Error('unexpected request ' + url)
    }))
    const user = userEvent.setup()
    render(<AppointmentView canPrescribe />)
    await user.click(await screen.findByRole('button', { name: 'Edit patient details' }))
    const field = await screen.findByLabelText(/Full name/)
    await user.clear(field); await user.type(field, 'Asha Rao')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ id: 'p1', name: 'Asha Rao', phone: '+919800000001' })
    expect(puts[0].dob).toBeUndefined() // an untouched date of birth is not rewritten
    await screen.findByRole('heading', { name: /Asha Rao/ })
  })
})
