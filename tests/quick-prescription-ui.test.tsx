// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import QuickPrescriptionPage from '@/app/doctor/(protected)/quick-prescription/page'

type Call = { url: string; init?: RequestInit }
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

const ASHA = { id: 'p1', name: 'Asha Rao', phone: '+919800000001', dob: '1990-11-05T00:00:00.000Z' }
const RAVI = { id: 'p2', name: 'Ravi Shah', phone: '+919811111111', dob: '1985-02-03T00:00:00.000Z' }

function stubServer(routes: { search?: Route; save?: Route; share?: Route } = {}) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('/api/public/config')) return Response.json({ config: { today: '2026-11-05', timezone: 'Asia/Kolkata' } })
    if (url.startsWith('/api/patients/search')) {
      if (routes.search) return routes.search(url, init)
      const q = (new URL(url, 'http://x').searchParams.get('q') ?? '').toLowerCase()
      return Response.json({ patients: [ASHA, RAVI].filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)) })
    }
    if (url === '/api/doctor/quick-prescription') return routes.save ? routes.save(url, init) : Response.json({ appointmentId: 'a1', patientId: 'p1', prescriptionId: 'rx1', patientCreated: true }, { status: 201 })
    if (url === '/api/prescriptions/rx1/whatsapp') return routes.share ? routes.share(url, init) : Response.json({ ok: true, to: '+91*******001' })
    if (url.startsWith('/api/prescriptions/medicines')) return Response.json({ medicines: [] })
    throw new Error('unexpected request ' + url)
  }))
  return calls
}
const saves = (calls: Call[]) => calls.filter(c => c.url === '/api/doctor/quick-prescription')
const shares = (calls: Call[]) => calls.filter(c => c.url.endsWith('/whatsapp'))
const searches = (calls: Call[]) => calls.filter(c => c.url.startsWith('/api/patients/search')).map(c => new URL(c.url, 'http://x').searchParams.get('q'))
const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement
// Each medicine card repeats the same labels; these are the first medicine's.
const medicineName = () => screen.getAllByLabelText('Medicine name')[0] as HTMLInputElement
const followUpChoice = (label: string) => within(screen.getByRole('group', { name: 'Follow-up after' })).getByRole('button', { name: label })

beforeEach(() => { stubServer() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function fillNewPatient(user: ReturnType<typeof userEvent.setup>, { number = '9811100000', name = 'Meera Joshi', age = '36', medicine = 'Paracetamol' } = {}) {
  await user.type(field(/Mobile number/), number)
  await user.type(field(/^Name/), name)
  await user.type(field(/^Age/), age)
  await user.click(screen.getByLabelText('Female'))
  await user.type(medicineName(), medicine)
}

describe('the patient section', () => {
  it('shows the country code with +91 filled in', () => {
    render(<QuickPrescriptionPage />)
    expect(field('Country code').value).toBe('+91')
  })

  it('shows age and date of birth together; typing one fills in the other', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Age/), '36')
    await waitFor(() => expect(field(/Date of birth/).value).toBe('1990-06-01'))

    await user.clear(field(/^Age/))
    expect(field(/Date of birth/).value).toBe('')

    fireEvent.change(field(/Date of birth/), { target: { value: '1985-02-03' } })
    expect(field(/^Age/).value).toBe('41')
    expect(screen.queryByText(/estimate/)).toBeNull()
  })

  it('says the date of birth is an estimate when it came from the age', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Age/), '36')
    expect(screen.getByText(/estimate from the age/)).toBeTruthy()
  })

  it('sends the age when the age was typed last, the date of birth when that was', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls)[0].init!.body as string).patient).toEqual({ name: 'Meera Joshi', phone: '+919811100000', ageYears: 36, gender: 'FEMALE' })

    cleanup(); const calls2 = stubServer()
    render(<QuickPrescriptionPage />)
    await user.type(field(/Mobile number/), '9811100000')
    await user.type(field(/^Name/), 'Meera Joshi')
    fireEvent.change(field(/Date of birth/), { target: { value: '1985-02-03' } })
    await user.click(screen.getByLabelText('Male'))
    await user.type(medicineName(), 'Syrup')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls2)[0].init!.body as string).patient).toEqual({ name: 'Meera Joshi', phone: '+919811100000', dob: '1985-02-03', gender: 'MALE' })
  })

  it('uses another country code when it is changed, and splits a pasted international number', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    fireEvent.change(field('Country code'), { target: { value: '+44' } })
    await user.type(field(/Mobile number/), '7700900123')
    expect(screen.getByText('Goes to +447700900123')).toBeTruthy()

    await user.clear(field(/Mobile number/))
    fireEvent.change(field(/Mobile number/), { target: { value: '+971501234567' } })
    expect(field('Country code').value).toBe('+971')
    expect(field(/Mobile number/).value).toBe('501234567')
    expect(screen.getByText('Goes to +971501234567')).toBeTruthy()
    expect(saves(calls)).toHaveLength(0)
  })
})

describe('finding an existing patient while typing', () => {
  it('searches by name as soon as two letters are typed and offers the matches in a dropdown', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'A')
    await new Promise(r => setTimeout(r, 300))
    expect(searches(calls)).toHaveLength(0)

    await user.type(field(/^Name/), 's')
    const option = await screen.findByRole('option', { name: /Asha Rao/ })
    expect(option.textContent).toContain('+919800000001')
    expect(option.textContent).toContain('36 yrs')
    expect(searches(calls)).toEqual(['As'])
    expect(field(/^Name/).getAttribute('aria-expanded')).toBe('true')
  })

  it('searches by number from three digits, whichever way the number is written', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/Mobile number/), '98')
    await new Promise(r => setTimeout(r, 300))
    expect(searches(calls)).toHaveLength(0)
    await user.type(field(/Mobile number/), '0')
    expect(await screen.findByRole('option', { name: /Asha Rao/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Ravi Shah/ })).toBeNull()
  })

  it('choosing a match fills in the name, number, age and date of birth and locks them', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'asha')
    await user.click(await screen.findByRole('option', { name: /Asha Rao/ }))

    expect(field(/^Name/).value).toBe('Asha Rao')
    expect(field('Country code').value).toBe('+91')
    expect(field(/Mobile number/).value).toBe('9800000001')
    expect(field(/^Age/).value).toBe('36')
    expect(field(/Date of birth/).value).toBe('1990-11-05')
    expect(field(/^Name/).disabled).toBe(true)
    expect(field(/Mobile number/).disabled).toBe(true)
    expect(field('Country code').disabled).toBe(true)
    expect(field(/^Age/).disabled).toBe(true)
    expect(field(/Date of birth/).disabled).toBe(true)
    expect(screen.getAllByRole('img', { name: 'locked' })).toHaveLength(4)
    expect(screen.getByText(/press .Not them./)).toBeTruthy()
    expect(screen.getByText(/Existing patient/)).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.type(medicineName(), 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved for Asha Rao/)
    const body = JSON.parse(saves(calls)[0].init!.body as string)
    expect(body.patientId).toBe('p1')
    expect(body.patient).toBeUndefined()
  })

  it('works from the keyboard: arrow down, Enter', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/Mobile number/), '981')
    await screen.findByRole('option', { name: /Ravi Shah/ })
    await user.keyboard('{ArrowDown}{Enter}')
    expect(field(/^Name/).value).toBe('Ravi Shah')
    expect(field(/^Age/).value).toBe('41')
  })

  it('Escape closes the list without choosing anyone', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'as')
    await screen.findByRole('option')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(field(/^Name/).value).toBe('as')
    expect(field(/^Name/).disabled).toBe(false)
  })

  it('"Not them" lets the doctor start again with a new patient', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'asha')
    await user.click(await screen.findByRole('option', { name: /Asha Rao/ }))
    await user.click(screen.getByRole('button', { name: /Not them/ }))
    expect(field(/^Name/).value).toBe('')
    expect(field(/^Name/).disabled).toBe(false)
    expect(field(/Mobile number/).disabled).toBe(false)
    expect(field(/^Age/).value).toBe('')
    expect(screen.queryAllByRole('img', { name: 'locked' })).toHaveLength(0)
  })

  it('a failed search does not get in the way of typing a new patient', async () => {
    const calls = stubServer({ search: () => new Response('{}', { status: 500 }) }); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect(await screen.findByText(/Prescription saved for Meera Joshi/)).toBeTruthy()
    expect(saves(calls)).toHaveLength(1)
  })
})

describe('the prescription section', () => {
  it('shows the optional fields straight away, nothing is hidden behind a click', () => {
    render(<QuickPrescriptionPage />)
    for (const label of [/Chief complaint/, /^Diagnosis/, /Follow-up visit/, /Additional Notes/]) {
      const el = screen.getByLabelText(label)
      expect(el.closest('details')).toBeNull()
    }
    // One note says so, instead of "(optional)" on every label.
    expect(screen.getByText('All fields are optional. Fill in at least one to save the prescription.')).toBeTruthy()
    expect(screen.getByLabelText(/Additional Notes/).closest('.form-group')!.textContent).not.toContain('(optional)')
    expect(screen.getByLabelText(/^Diagnosis/).closest('.form-group')!.textContent).not.toContain('(optional)')
    expect(screen.getByLabelText(/Chief complaint/).closest('.form-group')!.textContent).not.toContain('(optional)')
  })

  it('has the same quick follow-up choices as the appointment page, counted from today', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    for (const label of ['3 days', '1 week', '1 month', '3 months']) expect(followUpChoice(label)).toBeTruthy()
    const group = within(screen.getByRole('group', { name: 'Follow-up after' }))
    expect(group.queryByRole('button', { name: '5 days' })).toBeNull()
    expect(group.queryByRole('button', { name: '2 weeks' })).toBeNull()
    await user.click(followUpChoice('3 days'))
    expect(field(/Follow-up visit/).value).toBe('2026-11-08')
    await user.click(followUpChoice('1 week'))
    expect(field(/Follow-up visit/).value).toBe('2026-11-12')
    await user.click(followUpChoice('1 month'))
    expect(field(/Follow-up visit/).value).toBe('2026-12-05')
    await user.click(followUpChoice('3 months'))
    expect(field(/Follow-up visit/).value).toBe('2027-02-03')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(field(/Follow-up visit/).value).toBe('')
  })

  it('has a place for the chief complaint, above the diagnosis, and sends it', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    const complaint = screen.getByLabelText(/Chief complaint/)
    const diagnosis = screen.getByLabelText(/^Diagnosis/)
    expect(complaint.compareDocumentPosition(diagnosis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await fillNewPatient(user)
    await user.type(complaint, 'Fever and cough for 3 days')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls)[0].init!.body as string).chiefComplaint).toBe('Fever and cough for 3 days')
  })

  it('sends no chief complaint when it was left blank (nothing is made up)', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.type(screen.getByLabelText(/Chief complaint/), '   ')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls)[0].init!.body as string).chiefComplaint).toBeNull()
  })

  it('sends the diagnosis, follow-up date and notes with the prescription', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.type(field(/^Diagnosis/), 'Fever')
    await user.click(followUpChoice('1 week'))
    await user.type(field(/Additional Notes/), 'Plenty of fluids')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    const body = JSON.parse(saves(calls)[0].init!.body as string)
    expect(body).toMatchObject({ diagnosis: 'Fever', followUpDate: '2026-11-12', notes: 'Plenty of fluids' })
  })
})

describe('saving and sending', () => {
  it('saves a new patient\'s prescription and sends it on WhatsApp with one click', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.type(screen.getAllByLabelText('Dosage')[0] as HTMLInputElement, '500 mg')
    expect(screen.getByText('Goes to +919811100000')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Save & share on WhatsApp/ }))
    expect(await screen.findByText(/Prescription saved for Meera Joshi/)).toBeTruthy()
    expect(await screen.findByText(/Sent to \+91\*+001/)).toBeTruthy()
    const body = JSON.parse(saves(calls)[0].init!.body as string)
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
    expect(await screen.findByText(/Prescription saved for Meera Joshi/)).toBeTruthy()
    expect(shares(calls)).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Send on WhatsApp to \+919811100000/ })).toBeTruthy()
  })

  it('says what is missing and sends nothing until it is there', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('mobile number')

    await user.type(field(/Mobile number/), '9811100000')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('name')

    await user.type(field(/^Name/), 'Meera Joshi')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('age or date of birth')

    await user.type(field(/^Age/), '36')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('gender')

    await user.click(screen.getByLabelText('Other'))
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
    expect(medicineName().value).toBe('Paracetamol')
    expect(field(/^Name/).value).toBe('Meera Joshi')
  })

  it('if WhatsApp fails the prescription is still saved, and "Try again" resends without saving twice', async () => {
    let attempt = 0
    const calls = stubServer({ share: () => ++attempt === 1 ? Response.json({ error: 'WhatsApp is not available right now' }, { status: 502 }) : Response.json({ ok: true, to: '+91*******001' }) })
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save & share on WhatsApp/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('not available right now')
    expect(screen.getByText(/Prescription saved for Meera Joshi/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Sent to'))
    expect(saves(calls)).toHaveLength(1)
    expect(shares(calls)).toHaveLength(2)
  })

  it('"New quick prescription" starts again with an empty form and +91', async () => {
    const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    fireEvent.change(field('Country code'), { target: { value: '+44' } })
    await fillNewPatient(user)
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    await user.click(screen.getByRole('button', { name: /New quick prescription/ }))
    expect(field(/Mobile number/).value).toBe('')
    expect(field('Country code').value).toBe('+91')
    expect(field(/^Age/).value).toBe('')
    expect(medicineName().value).toBe('')
  })
})

describe('opened from a patient page', () => {
  afterEach(() => { window.history.pushState({}, '', '/') })

  it('has that patient already picked and locked, so the doctor can go straight to the medicines', async () => {
    window.history.pushState({}, '', '/doctor/quick-prescription?patient=p1&phone=%2B919800000001')
    render(<QuickPrescriptionPage />)
    await waitFor(() => expect(field(/^Name/).value).toBe('Asha Rao'))
    expect(field(/^Name/).disabled).toBe(true)
    expect(field(/Mobile number/).value).toBe('9800000001')
  })

  it('stays an ordinary empty form when the patient cannot be found', async () => {
    const calls = stubServer()
    window.history.pushState({}, '', '/doctor/quick-prescription?patient=nobody&phone=9800000001')
    render(<QuickPrescriptionPage />)
    await waitFor(() => expect(searches(calls).length).toBeGreaterThan(0))
    expect(field(/^Name/).disabled).toBe(false)
  })
})

describe('gender', () => {
  const radios = () => ['Male', 'Female', 'Other'].map(l => screen.getByLabelText(l) as HTMLInputElement)

  it('is three radio buttons, none chosen to begin with', () => {
    render(<QuickPrescriptionPage />)
    expect(radios().map(r => r.type)).toEqual(['radio', 'radio', 'radio'])
    expect(radios().some(r => r.checked)).toBe(false)
  })

  it('takes one choice at a time', async () => {
    const user = userEvent.setup(); render(<QuickPrescriptionPage />)
    await user.click(screen.getByLabelText('Male')); await user.click(screen.getByLabelText('Other'))
    expect(radios().map(r => r.checked)).toEqual([false, false, true])
  })

  it('is filled in and locked for a patient who has one on record', async () => {
    const user = userEvent.setup(); stubServer({ search: () => Response.json({ patients: [{ ...ASHA, gender: 'FEMALE' }] }) })
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'Asha')
    await user.click(await screen.findByRole('option', { name: /Asha Rao/ }))
    expect(radios().map(r => r.checked)).toEqual([false, true, false])
    expect(radios().every(r => r.matches(':disabled'))).toBe(true)
  })

  it('can be added for an older patient who has none, and is then saved on their record', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'Asha')
    await user.click(await screen.findByRole('option', { name: /Asha Rao/ }))
    expect(radios().every(r => !r.matches(':disabled'))).toBe(true)
    await user.click(screen.getByLabelText('Female'))
    await user.type(medicineName(), 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls)[0].init!.body as string)).toMatchObject({ patientId: 'p1', gender: 'FEMALE' })
  })

  it('does not hold up an older patient who has none: it is optional for them', async () => {
    const calls = stubServer(); const user = userEvent.setup()
    render(<QuickPrescriptionPage />)
    await user.type(field(/^Name/), 'Asha')
    await user.click(await screen.findByRole('option', { name: /Asha Rao/ }))
    await user.type(medicineName(), 'Paracetamol')
    await user.click(screen.getByRole('button', { name: /Save only/ }))
    await screen.findByText(/Prescription saved/)
    expect(JSON.parse(saves(calls)[0].init!.body as string).gender).toBeUndefined()
  })
})
