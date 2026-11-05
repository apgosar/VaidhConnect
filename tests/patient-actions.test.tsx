// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, refresh: nav.refresh }) }))

import PatientActions from '@/components/doctor/PatientActions'

const patient = { id: 'p1', name: 'Asha Rao', phone: '+919800000001', dob: '1990-06-01', dobApproximate: true, gender: 'FEMALE', hasVisits: false }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); nav.push.mockClear(); nav.refresh.mockClear() })

function stub(status = 200) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return status === 200 ? Response.json({ ok: true }) : Response.json({ error: 'nope' }, { status }) }))
  return calls
}

describe('patient edit and delete buttons', () => {
  it('saves the edited details and leaves an untouched date of birth alone', async () => {
    const calls = stub(); const user = userEvent.setup()
    render(<PatientActions patient={patient} today="2026-11-05" />)
    await user.click(screen.getByRole('button', { name: /Edit patient/ }))
    const name = screen.getByLabelText(/Full name/); await user.clear(name); await user.type(name, 'Asha R. Rao')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    const body = JSON.parse(calls[0].init!.body as string)
    expect(calls[0].init!.method).toBe('PUT')
    expect(body).toMatchObject({ id: 'p1', name: 'Asha R. Rao', phone: '+919800000001', gender: 'FEMALE' })
    expect(body.dob).toBeUndefined()
  })

  it('shows the server\'s reason when saving fails', async () => {
    stub(409); const user = userEvent.setup()
    render(<PatientActions patient={patient} today="2026-11-05" />)
    await user.click(screen.getByRole('button', { name: /Edit patient/ }))
    await user.click(screen.getByRole('button', { name: /Save changes/ }))
    expect(await screen.findByText('nope')).toBeTruthy()
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('asks before deleting, then returns to the list', async () => {
    const calls = stub(); const user = userEvent.setup()
    render(<PatientActions patient={patient} today="2026-11-05" />)
    await user.click(screen.getByRole('button', { name: /Delete Asha Rao/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/doctor/patients'))
    expect(calls[0].url).toBe('/api/patients?id=p1')
    expect(calls[0].init!.method).toBe('DELETE')
  })

  it('warns that the patient visits and prescriptions are deleted too, and only deletes after a yes', async () => {
    const calls = stub(); const user = userEvent.setup()
    render(<PatientActions patient={{ ...patient, hasVisits: true }} today="2026-11-05" />)
    await user.click(screen.getByRole('button', { name: /Delete Asha Rao/ }))
    expect(await screen.findByText(/also delete all associated visit records and prescriptions/)).toBeTruthy()
    expect(calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /Delete Asha Rao/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls).toHaveLength(1))
  })
})
