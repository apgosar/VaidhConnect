// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import QuickPrescriptionPage from '@/app/doctor/(protected)/quick-prescription/page'

type Call = { url: string; init?: RequestInit }
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

function stubServer(routes: { search?: Route; save?: Route; share?: Route } = {}) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('/api/public/config')) return Response.json({ config: { today: '2026-11-05', timezone: 'Asia/Kolkata' } })
    if (url.startsWith('/api/patients/search')) return routes.search ? routes.search(url, init) : Response.json({ patients: [] })
    if (url === '/api/doctor/quick-prescription') return routes.save ? routes.save(url, init) : Response.json({ appointmentId: 'a1', patientId: 'p1', prescriptionId: 'rx1', patientCreated: true }, { status: 201 })
    if (url === '/api/prescriptions/rx1/whatsapp') return routes.share ? routes.share(url, init) : Response.json({ ok: true, to: '+91*******001' })
    if (url.startsWith('/api/prescriptions/medicines')) return Response.json({ medicines: [] })
    throw new Error('unexpected request ' + url)
  }))
  return calls
}
const saves = (calls: Call[]) => calls.filter(c => c.url === '/api/doctor/quick-prescription')
const shares = (calls: Call[]) => calls.filter(c => c.url.endsWith('/whatsapp'))

beforeEach(() => { stubServer() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function fillNewPatient(user: ReturnType<typeof userEvent.setup>, { phone = '9800000001', name = 'Asha Rao', age = '36', medicine = 'Paracetamol' } = {}) {
  await user.type(screen.getByLabelText(/Mobile number/), phone)
  await user.type(await screen.findByLabelText(/^Name/), name)
  await user.type(screen.getByLabelText(/Age \(years\)/), age)
  await user.type(screen.getByLabelText('Medicine 1 name'), medicine)
}

describe('Quick prescription page', () => {
  it('saves a new patient\'s prescription and sends it on WhatsApp with one click', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.type(screen.getByLabelText('Medicine 1 dosage'), '500 mg')
    await user.type(screen.getByLabelText(/^Diagnosis/), 'Fever')
    expect(screen.getByText('Will be sent to +919800000001')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Save and send on WhatsApp/ }))
    expect(await screen.findByText(/Prescription saved for Asha Rao/)).toBeTruthy()
    expect(await screen.findByText(/Sent to \+91\*+001/)).toBeTruthy()

    const body = JSON.parse(saves(calls)[0].init!.body as string)
    expect(body.patient).toEqual({ name: 'Asha Rao', phone: '+919800000001', ageYears: 36 })
    expect(body.patientId).toBeUndefined()
    expect(body.diagnosis).toBe('Fever')
    expect(body.medicines).toEqual([expect.objectContaining({ name: 'Paracetamol', dosage: '500 mg' })])
    expect(shares(calls)).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Download PDF/ }).getAttribute('href')).toBe('/api/prescriptions/rx1/pdf')
    expect(screen.getByRole('link', { name: /Open visit/ }).getAttribute('href')).toBe('/doctor/appointments/a1')
  })

  it('"Save only" saves without sending anything', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect(await screen.findByText(/Prescription saved for Asha Rao/)).toBeTruthy()
    expect(shares(calls)).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Send on WhatsApp to \+919800000001/ })).toBeTruthy()
  })

  it('sends a date of birth instead of an age when asked to', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(screen.getByLabelText(/Mobile number/), '9800000001')
    await user.type(await screen.findByLabelText(/^Name/), 'Ravi Shah')
    await user.click(screen.getByRole('button', { name: 'Use date of birth' }))
    await user.type(screen.getByLabelText(/Date of birth/), '1985-02-03')
    await user.type(screen.getByLabelText('Medicine 1 name'), 'Cetirizine')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls)[0].init!.body as string).patient).toEqual({ name: 'Ravi Shah', phone: '+919800000001', dob: '1985-02-03' })
  })

  it('picks a returning patient by their number instead of asking for their details again', async () => {
    const calls = stubServer({ search: () => Response.json({ patients: [{ id: 'p1', name: 'Asha Rao', phone: '+919800000001', dob: '1990-11-05T00:00:00.000Z' }] }) })
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(screen.getByLabelText(/Mobile number/), '9800000001')
    expect(await screen.findByRole('radio', { name: /Asha Rao/ })).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Asha Rao/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByLabelText(/^Name/)).toBeNull()

    await user.type(screen.getByLabelText('Medicine 1 name'), 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved for Asha Rao/)
    const body = JSON.parse(saves(calls)[0].init!.body as string)
    expect(body.patientId).toBe('p1')
    expect(body.patient).toBeUndefined()
  })

  it('lets the doctor say it is someone else on a shared number', async () => {
    const calls = stubServer({ search: () => Response.json({ patients: [{ id: 'p1', name: 'Asha Rao', phone: '+919800000001' }] }) })
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(screen.getByLabelText(/Mobile number/), '9800000001')
    await user.click(await screen.findByRole('radio', { name: /Someone else on this number/ }))
    await user.type(screen.getByLabelText(/^Name/), 'Mihir Rao')
    await user.type(screen.getByLabelText(/Age \(years\)/), '8')
    await user.type(screen.getByLabelText('Medicine 1 name'), 'Syrup')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved for Mihir Rao/)
    expect(JSON.parse(saves(calls)[0].init!.body as string).patient.name).toBe('Mihir Rao')
  })

  it('says what is missing and sends nothing until it is there', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('mobile number')

    await user.type(screen.getByLabelText(/Mobile number/), '9800000001')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('name')

    await user.type(screen.getByLabelText(/^Name/), 'Asha Rao')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('age')

    await user.type(screen.getByLabelText(/Age \(years\)/), '36')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('medicine')
    expect(saves(calls)).toHaveLength(0)
  })

  it('shows the server\'s reason when saving fails, and keeps what was typed', async () => {
    stubServer({ save: () => Response.json({ error: 'The follow-up date cannot be before the visit' }, { status: 400 }) })
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('follow-up date cannot be before')
    expect((screen.getByLabelText('Medicine 1 name') as HTMLInputElement).value).toBe('Paracetamol')
  })

  it('if WhatsApp fails the prescription is still saved, and "Try again" resends without saving twice', async () => {
    let attempt = 0
    const calls = stubServer({ share: () => ++attempt === 1 ? Response.json({ error: 'WhatsApp is not available right now' }, { status: 502 }) : Response.json({ ok: true, to: '+91*******001' }) })
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save and send on WhatsApp/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('not available right now')
    expect(screen.getByText(/Prescription saved for Asha Rao/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Sent to'))
    expect(saves(calls)).toHaveLength(1)
    expect(shares(calls)).toHaveLength(2)
  })

  it('"New quick prescription" starts again with an empty form', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    await user.click(screen.getByRole('button', { name: /New quick prescription/ }))
    expect((screen.getByLabelText(/Mobile number/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Medicine 1 name') as HTMLInputElement).value).toBe('')
  })
})
