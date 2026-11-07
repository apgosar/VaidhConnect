// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'a1' }), useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))

import AppointmentView from '@/app/doctor/(protected)/appointments/[id]/AppointmentView'
import { MedicineList } from '@/components/doctor/MedicineList'
import { PrescriptionFields } from '@/components/doctor/PrescriptionFields'
import { emptyRx, type RxContent } from '@/lib/rxContent'
import type { Medicine } from '@/lib/constants'

type Call = { url: string; init?: RequestInit }

const APPT = {
  id: 'a1', startTime: '2026-11-05T04:30:00.000Z', endTime: '2026-11-05T04:45:00.000Z', status: 'BOOKED', chiefComplaint: 'Cough',
  patient: { id: 'p1', name: 'Asha Rao', phone: '+919800000001', dob: '1990-11-05T00:00:00.000Z' },
}

function stubServer(over: { appointment?: object; share?: () => Response; save?: () => Response } = {}) {
  const calls: Call[] = []
  // Like the real server: once a prescription is saved, the appointment comes back with it.
  let saved: object | null = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url === '/api/appointments/a1') return Response.json({ appointment: { ...(over.appointment ?? APPT), ...(saved ? { prescription: { id: 'rx1', ...saved } } : {}) } })
    if (url === '/api/doctor/profile') return Response.json({ doctor: { adviceOptions: ['Avoid outside food', 'Drink plenty of water'] } })
    if (url === '/api/appointments/a1/rx-scans') return Response.json({ scans: [] })
    if (url === '/api/prescriptions') {
      if (over.save) return over.save()
      saved = JSON.parse(init!.body as string)
      return Response.json({ prescription: { id: 'rx1' } }, { status: 201 })
    }
    if (url === '/api/prescriptions/rx1/whatsapp') return over.share ? over.share() : Response.json({ ok: true, to: '+91*******001' })
    if (url.startsWith('/api/prescriptions/medicines')) return Response.json({ medicines: [] })
    throw new Error('unexpected request ' + url)
  }))
  return calls
}
const posts = (calls: Call[], url: string) => calls.filter(c => c.url === url && c.init?.method === 'POST')

beforeEach(() => { stubServer() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function openPrescription(user: ReturnType<typeof userEvent.setup>) {
  render(<AppointmentView canPrescribe />)
  await user.click(await screen.findByRole('button', { name: 'Prescription' }))
}

describe('Save & share on the appointment page', () => {
  it('saves and sends on WhatsApp with one tap, without asking again', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    await openPrescription(user)
    await user.type(screen.getAllByLabelText('Medicine name')[0], 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save & share on WhatsApp/ }))

    await screen.findByText(/The patient has the prescription on WhatsApp/)
    expect(posts(calls, '/api/prescriptions')).toHaveLength(1)
    expect(posts(calls, '/api/prescriptions/rx1/whatsapp')).toHaveLength(1)
    // saved first, then sent
    expect(calls.findIndex(c => c.url === '/api/prescriptions')).toBeLessThan(calls.findIndex(c => c.url.endsWith('/whatsapp')))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('says what is missing instead of failing quietly (the number itself is not shown)', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    await openPrescription(user)
    expect(screen.queryByText(/Goes to/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Save & share on WhatsApp/ }))
    expect(await screen.findByText('Add a medicine, some advice or a diagnosis.')).toBeTruthy()
    expect(posts(calls, '/api/prescriptions')).toHaveLength(0)
  })

  it('keeps the prescription saved and says so when WhatsApp fails, and sending again does not need re-typing', async () => {
    let attempt = 0
    const calls = stubServer({ share: () => (++attempt === 1 ? Response.json({ error: 'WhatsApp is not available' }, { status: 502 }) : Response.json({ ok: true, to: '+91*******001' })) })
    const user = userEvent.setup()
    await openPrescription(user)
    await user.type(screen.getAllByLabelText('Medicine name')[0], 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save & share on WhatsApp/ }))
    expect(await screen.findByText(/WhatsApp is not available/)).toBeTruthy()
    expect(screen.getByText(/The prescription is saved/)).toBeTruthy()

    // Saved prescriptions are read-only: sending again is "Share again", and nothing is saved a second time.
    await user.click(screen.getByRole('button', { name: /Share again/ }))
    await screen.findByText(/The patient has the prescription on WhatsApp/)
    expect(posts(calls, '/api/prescriptions/rx1/whatsapp')).toHaveLength(2)
    expect(posts(calls, '/api/prescriptions')).toHaveLength(1)
  })

  it('shows a saved prescription read-only, with Preview in a new tab, Share again and Edit', async () => {
    const stored = { id: 'rx1', medicines: [{ name: 'Paracetamol', dose: '500 mg', frequency: 'Twice a day', duration: '3 days' }], advice: [] }
    stubServer({ appointment: { ...APPT, prescription: stored } })
    const user = userEvent.setup()
    await openPrescription(user)

    expect(await screen.findByText('Prescription saved')).toBeTruthy()
    expect(screen.queryAllByLabelText('Medicine name')).toHaveLength(0)
    const preview = screen.getByRole('link', { name: /Preview/ })
    expect(preview.getAttribute('target')).toBe('_blank')
    expect(preview.getAttribute('href')).toContain('/api/prescriptions/rx1/pdf?inline=1')
    expect(screen.getByRole('button', { name: /Share again/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Edit prescription' }))
    expect(screen.getAllByLabelText('Medicine name').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryAllByLabelText('Medicine name')).toHaveLength(0)
  })

  it('hides the paper-prescription box once saved, but keeps photos already uploaded', async () => {
    const stored = { id: 'rx1', medicines: [{ name: 'Paracetamol', dose: '500 mg', frequency: 'Twice a day', duration: '3 days' }], advice: [] }
    const calls = stubServer({ appointment: { ...APPT, prescription: stored } })
    const user = userEvent.setup()
    await openPrescription(user)
    await screen.findByText('Prescription saved')
    expect(screen.queryByText('Wrote it on paper?')).toBeNull()
    expect(screen.queryByRole('button', { name: /Take photo/ })).toBeNull()
    expect(screen.queryByText('Handwritten prescription photos')).toBeNull() // no photos, nothing shown

    // with a photo already kept, it stays visible (without the upload buttons)
    const base = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (url === '/api/appointments/a1/rx-scans'
      ? Response.json({ scans: [{ id: 's1', url: 'https://files.test/s1.jpg', uploadedAt: '2026-11-05T05:00:00.000Z' }] })
      : base(url, init))))
    cleanup()
    await openPrescription(user)
    expect(await screen.findByText('Handwritten prescription photos')).toBeTruthy()
    expect(screen.getByAltText('Handwritten prescription, page 1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Take photo/ })).toBeNull()
    void calls
  })

  it('offers Call and WhatsApp instead of showing the phone number', async () => {
    stubServer()
    render(<AppointmentView canPrescribe />)
    const call = await screen.findByRole('link', { name: /Call/ })
    expect(call.getAttribute('href')).toBe('tel:+919800000001')
    expect(screen.getByRole('link', { name: /WhatsApp Asha/ }).getAttribute('href')).toBe('https://wa.me/919800000001')
    expect(document.body.textContent).not.toContain('9800000001')
  })

  it('does not send when saving fails, and shows the reason', async () => {
    const calls = stubServer({ save: () => Response.json({ error: 'The follow-up date cannot be before the visit' }, { status: 400 }) })
    const user = userEvent.setup()
    await openPrescription(user)
    await user.type(screen.getAllByLabelText('Medicine name')[0], 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save & share on WhatsApp/ }))
    expect(await screen.findByText(/follow-up date cannot be before/)).toBeTruthy()
    expect(posts(calls, '/api/prescriptions/rx1/whatsapp')).toHaveLength(0)
  })

  it('"Save only" saves and sends nothing', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    await openPrescription(user)
    await user.type(screen.getAllByLabelText('Medicine name')[0], 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await waitFor(() => expect(posts(calls, '/api/prescriptions')).toHaveLength(1))
    expect(posts(calls, '/api/prescriptions/rx1/whatsapp')).toHaveLength(0)
  })

  it('is switched off, with the reason, when the patient has no usable number', async () => {
    stubServer({ appointment: { ...APPT, patient: { ...APPT.patient, phone: '' } } }); const user = userEvent.setup()
    await openPrescription(user)
    const send = screen.getByRole('button', { name: /Save & share on WhatsApp/ }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    expect(screen.getByText(/Add a valid mobile number/)).toBeTruthy()
  })

  it('sends the examination, investigations and advice that were filled in', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    await openPrescription(user)
    await user.type(screen.getAllByLabelText('Medicine name')[0], 'Paracetamol')
    await user.type(screen.getByLabelText(/On examination/), 'BP 120/80')
    await user.click(screen.getByRole('button', { name: 'CBC' }))
    await user.click(await screen.findByRole('button', { name: 'Avoid outside food' }))
    await user.type(screen.getByLabelText('Other advice'), 'Cut down on tea')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await waitFor(() => expect(posts(calls, '/api/prescriptions')).toHaveLength(1))
    expect(JSON.parse(posts(calls, '/api/prescriptions')[0].init!.body as string)).toMatchObject({
      onExamination: 'BP 120/80', investigations: 'CBC', advice: ['Avoid outside food'], adviceOther: 'Cut down on tea',
    })
  })
})

describe('which tab a visit opens on', () => {
  afterEach(() => { window.history.pushState({}, '', '/') })
  const selected = () => screen.getAllByRole('button').filter(b => b.className.includes('border-blue-600')).map(b => b.textContent)

  it('a doctor opens straight on the prescription', async () => {
    render(<AppointmentView canPrescribe />)
    await screen.findByLabelText(/On examination/)
    expect(selected()).toEqual(['Prescription'])
  })

  it('a link can ask for another tab', async () => {
    window.history.pushState({}, '', '/doctor/appointments/a1?tab=payment')
    render(<AppointmentView canPrescribe />)
    await screen.findByLabelText('Amount (₹)')
  })

  it('front-desk staff open on Payment and have no Prescription tab, even when a link asks for it', async () => {
    window.history.pushState({}, '', '/doctor/appointments/a1?tab=prescription')
    render(<AppointmentView canPrescribe={false} />)
    await screen.findByLabelText('Amount (₹)')
    expect(screen.queryByRole('button', { name: 'Prescription' })).toBeNull()
    expect(screen.queryByLabelText(/On examination/)).toBeNull()
  })
})

describe('the camera and gallery buttons for a handwritten prescription', () => {
  it('has one input that opens the rear camera and one that picks from the gallery', async () => {
    const user = userEvent.setup()
    await openPrescription(user)
    const camera = screen.getByLabelText('Take a photo of the prescription') as HTMLInputElement
    const gallery = screen.getByLabelText('Choose prescription photos from the gallery') as HTMLInputElement
    expect(camera.getAttribute('capture')).toBe('environment')
    expect(camera.accept).toBe('image/*')
    expect(gallery.multiple).toBe(true)
    expect(gallery.hasAttribute('capture')).toBe(false)
  })

  it('sends the chosen photo to the visit', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    await openPrescription(user)
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'rx.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Choose prescription photos from the gallery'), { target: { files: [file] } })
    await waitFor(() => expect(posts(calls, '/api/appointments/a1/rx-scans')).toHaveLength(1))
    expect((posts(calls, '/api/appointments/a1/rx-scans')[0].init!.body as FormData).getAll('photo')).toHaveLength(1)
  })
})

describe('the advice choices', () => {
  function Harness({ initial }: { initial?: Partial<RxContent> }) {
    const [rx, setRx] = useState<RxContent>({ ...emptyRx(), ...initial })
    return <><PrescriptionFields value={rx} onChange={p => setRx(prev => ({ ...prev, ...p }))} baseDate="2026-11-05" /><output data-testid="advice">{JSON.stringify(rx.advice)}</output></>
  }

  it('lists the clinic advice, ticks and unticks with a tap', async () => {
    const user = userEvent.setup(); render(<Harness />)
    const chip = await screen.findByRole('button', { name: 'Drink plenty of water' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await user.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('advice').textContent).toBe('["Drink plenty of water"]')
    await user.click(chip)
    expect(screen.getByTestId('advice').textContent).toBe('[]')
  })

  it('keeps advice that was ticked before but has since been removed from the clinic list', async () => {
    render(<Harness initial={{ advice: ['Avoid cold drinks'] }} />)
    const chip = await screen.findByRole('button', { name: 'Avoid cold drinks' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })

  it('adds and removes an investigation from the typed list when its chip is tapped', async () => {
    const user = userEvent.setup(); render(<Harness />)
    const box = screen.getByLabelText(/Advised investigations/) as HTMLTextAreaElement
    await user.type(box, 'Calcium')
    await user.click(screen.getByRole('button', { name: 'CBC' }))
    expect(box.value).toBe('Calcium, CBC')
    await user.click(screen.getByRole('button', { name: 'CBC' }))
    expect(box.value).toBe('Calcium')
  })
})

describe('tapering doses on a phone', () => {
  function Harness({ initial }: { initial?: Medicine[] }) {
    const [meds, setMeds] = useState<Medicine[]>(initial ?? [{ name: 'Prednisolone', dosage: '', frequency: '', duration: '' }])
    return <><MedicineList medicines={meds} onChange={setMeds} /><output data-testid="meds">{JSON.stringify(meds)}</output></>
  }
  const meds = () => JSON.parse(screen.getByTestId('meds').textContent!) as Medicine[]

  it('explains what to add, with an example, and labels every box', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tapering dose' }))
    expect(screen.getByText(/Add each stage of the course/)).toBeTruthy()
    const step = screen.getByRole('group', { name: 'Step 1' })
    for (const label of ['Dose', 'How often', 'For how many days']) expect(within(step).getByLabelText(label)).toBeTruthy()
  })

  it('shows the day range of every step and a plain preview of what the patient will see', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tapering dose' }))
    await user.type(screen.getByLabelText('Dose'), '40 mg')
    await user.click(screen.getByRole('button', { name: /Add next step/ }))
    const second = screen.getByRole('group', { name: 'Step 2' })
    await user.type(within(second).getByLabelText('Dose'), '20 mg')
    expect(screen.getByText(/Step 1/, { selector: 'p' }).textContent).toContain('Day 1-5')
    expect(screen.getByText(/Step 2/, { selector: 'p' }).textContent).toContain('Day 6-10')
    const preview = screen.getByText('What the patient will see').parentElement!
    expect(preview.textContent).toContain('Day 1-5:')
    expect(preview.textContent).toContain('40 mg')
    expect(preview.textContent).toContain('Day 6-10:')
    expect(preview.textContent).toContain('10 days in all')
  })

  it('changes the days with the minus and plus buttons, never below 1', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tapering dose' }))
    await user.click(screen.getByRole('button', { name: /One day more for step 1/ }))
    expect(meds()[0].taper!.steps[0].days).toBe(6)
    const less = () => screen.getByRole('button', { name: /One day less for step 1/ }) as HTMLButtonElement
    for (let i = 0; i < 8 && !less().disabled; i++) await user.click(less())
    expect(meds()[0].taper!.steps[0].days).toBe(1)
    expect(less().disabled).toBe(true)
  })

  it('fills "how often" with one tap, and the next step starts from the previous step', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tapering dose' }))
    const first = screen.getByRole('group', { name: 'Step 1' })
    await user.click(within(first).getByRole('button', { name: 'Twice daily' }))
    expect(meds()[0].taper!.steps[0].frequency).toBe('Twice daily')
    await user.click(screen.getByRole('button', { name: /Add next step/ }))
    expect(meds()[0].taper!.steps[1]).toMatchObject({ dose: '', frequency: 'Twice daily', days: 5 })
  })

  it('removes a step, but never the last one', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tapering dose' }))
    await user.click(screen.getByRole('button', { name: /Add next step/ }))
    await user.click(screen.getByRole('button', { name: 'Remove step 2' }))
    expect(meds()[0].taper!.steps).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Remove step 1' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the typed dose and how often when switching a fixed dose to tapering and back', async () => {
    const user = userEvent.setup(); render(<Harness initial={[{ name: 'X', dosage: '10 mg', frequency: 'Once daily', duration: '7 days' }]} />)
    await user.click(screen.getByRole('button', { name: 'Tapering dose' }))
    expect(meds()[0].taper!.steps[0]).toMatchObject({ dose: '10 mg', frequency: 'Once daily', days: 7 })
    await user.click(screen.getByRole('button', { name: 'Same dose' }))
    expect(meds()[0]).toMatchObject({ dosage: '10 mg', frequency: 'Once daily' })
    expect(meds()[0].taper).toBeUndefined()
  })

  it('fills the usual answers for a fixed dose with one tap', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Thrice daily' }))
    await user.click(screen.getByRole('button', { name: '5 days' }))
    expect(meds()[0]).toMatchObject({ frequency: 'Thrice daily', duration: '5 days' })
  })
})

describe('Edit: reschedule or cancel a booked visit', () => {
  const openEdit = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<AppointmentView canPrescribe />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    return screen.findByRole('dialog', { name: 'Edit appointment' })
  }
  const patches = (calls: Call[]) => calls.filter(c => c.url === '/api/appointments/a1' && c.init?.method === 'PATCH')

  it('replaces the Reschedule button with Edit, which offers both choices', async () => {
    const user = userEvent.setup(); stubServer()
    render(<AppointmentView canPrescribe />)
    await screen.findByRole('button', { name: 'Edit' })
    expect(screen.queryByRole('button', { name: 'Reschedule' })).toBeNull()
    const dialog = await openEdit(user)
    expect(within(dialog).getByRole('button', { name: /Reschedule/ })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /Cancel appointment/ })).toBeTruthy()
  })

  it('is not offered for a visit that is already over or cancelled', async () => {
    stubServer({ appointment: { ...APPT, status: 'COMPLETED' } })
    render(<AppointmentView canPrescribe />)
    await screen.findByText('Asha Rao')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('Reschedule opens the time picker', async () => {
    const user = userEvent.setup(); stubServer()
    const dialog = await openEdit(user)
    await user.click(within(dialog).getByRole('button', { name: /Reschedule/ }))
    expect(await screen.findByRole('dialog', { name: /Choose a new time/ })).toBeTruthy()
  })

  it('Cancel asks once more, and says what will happen', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    const dialog = await openEdit(user)
    await user.click(within(dialog).getByRole('button', { name: /Cancel appointment/ }))
    const sure = await screen.findByRole('alertdialog', { name: 'Cancel this appointment?' })
    expect(within(sure).getByText(/told on WhatsApp/)).toBeTruthy()
    expect(patches(calls)).toHaveLength(0)
  })

  it('"Keep it" goes back without cancelling anything', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    const dialog = await openEdit(user)
    await user.click(within(dialog).getByRole('button', { name: /Cancel appointment/ }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))
    expect(await screen.findByRole('dialog', { name: 'Edit appointment' })).toBeTruthy()
    expect(patches(calls)).toHaveLength(0)
  })

  it('"Yes, cancel it" cancels the appointment and closes the dialog', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    const dialog = await openEdit(user)
    await user.click(within(dialog).getByRole('button', { name: /Cancel appointment/ }))
    await user.click(await screen.findByRole('button', { name: 'Yes, cancel it' }))
    await waitFor(() => expect(patches(calls)).toHaveLength(1))
    expect(JSON.parse(patches(calls)[0].init!.body as string)).toEqual({ status: 'CANCELLED' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('shows the reason and stays open when cancelling fails', async () => {
    stubServer(); const user = userEvent.setup()
    const original = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (url === '/api/appointments/a1' && init?.method === 'PATCH'
      ? Response.json({ error: 'This appointment is not active' }, { status: 409 }) : original(url, init))))
    const dialog = await openEdit(user)
    await user.click(within(dialog).getByRole('button', { name: /Cancel appointment/ }))
    await user.click(await screen.findByRole('button', { name: 'Yes, cancel it' }))
    expect(await screen.findByText('This appointment is not active')).toBeTruthy()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })
})

describe('the handwritten prescription buttons are at the top', () => {
  it('come before every field of the form, so the doctor does not scroll for them', async () => {
    const user = userEvent.setup(); await openPrescription(user)
    const take = screen.getByRole('button', { name: /Take photo/ })
    const gallery = screen.getByRole('button', { name: /From gallery/ })
    const firstField = screen.getByLabelText(/Chief complaint/)
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(take, firstField)).toBe(true)
    expect(before(gallery, firstField)).toBe(true)
    expect(before(take, screen.getByRole('button', { name: /Save & share on WhatsApp/ }))).toBe(true)
  })
})
