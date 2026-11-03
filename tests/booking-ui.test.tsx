// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn() }) }))

import NewAppointmentPage from '@/app/doctor/(protected)/appointments/new/page'
import CalendarPage from '@/app/doctor/(protected)/calendar/page'
import RegisterClient from '@/components/patient/RegisterClient'
import { getDraft } from '@/lib/patientDevice'

type Call = { url: string; init?: RequestInit }
const CONFIG = { today: '2026-11-05', timezone: 'Asia/Kolkata', enableChiefComplaint: false }
// 09:00 IST on 5 Nov 2026, in 15-minute slots
const slotAt = (i: number) => {
  const start = new Date(Date.UTC(2026, 10, 5, 3, 30) + i * 15 * 60_000)
  const label = `09:${String(i * 15).padStart(2, '0')} AM`
  return { start: start.toISOString(), end: new Date(start.getTime() + 15 * 60_000).toISOString(), label }
}

function stubBooking(slotIdx = [0, 1, 2, 3]) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('/api/public/config')) return Response.json({ config: CONFIG })
    if (url.startsWith('/api/appointments?mode=slots')) return Response.json({ slots: slotIdx.map(slotAt) })
    if (url === '/api/appointments' && init?.method === 'POST') return Response.json({ appointment: { id: 'a1' } }, { status: 201 })
    throw new Error('unexpected request ' + url)
  }))
  return calls
}
const posted = (calls: Call[]) => JSON.parse(calls.find(c => c.url === '/api/appointments' && c.init?.method === 'POST')!.init!.body as string)
const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement

beforeEach(() => { sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function openNewPatientForm(user: ReturnType<typeof userEvent.setup>) {
  render(<NewAppointmentPage />)
  await user.click(await screen.findByRole('button', { name: /New patient/ }))
  await user.type(field(/Full name/), 'Meera Joshi')
  fireEvent.change(field(/Mobile/), { target: { value: '+919811100000' } })
}

describe('adding a new patient while booking (staff)', () => {
  it('works out the date of birth from an age, and the age from a date of birth', async () => {
    stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    await user.type(field(/^Age/), '36')
    expect(field(/Date of birth/).value).toBe('1990-06-01')
    expect(screen.getByText(/estimate from the age/)).toBeTruthy()
    fireEvent.change(field(/Date of birth/), { target: { value: '1985-02-03' } })
    expect(field(/^Age/).value).toBe('41')
  })

  it('has Male, Female and Other as radio buttons, and will not book without one', async () => {
    stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    expect(['Male', 'Female', 'Other'].map(l => field(l).type)).toEqual(['radio', 'radio', 'radio'])
    await user.type(field(/^Age/), '36')
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    const book = screen.getByRole('button', { name: /Book appointment/ }) as HTMLButtonElement
    expect(book.disabled).toBe(true)
    await user.click(field('Female'))
    expect(book.disabled).toBe(false)
  })

  it('sends the estimated date of birth marked as an estimate, with the gender', async () => {
    const calls = stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    await user.type(field(/^Age/), '36')
    await user.click(field('Female'))
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    await user.click(screen.getByRole('button', { name: /Book appointment/ }))
    await screen.findByText(/Appointment booked/)
    expect(posted(calls).patient).toMatchObject({ name: 'Meera Joshi', dob: '1990-06-01', dobApproximate: true, gender: 'FEMALE' })
  })

  it('sends an exact date of birth without the estimate flag', async () => {
    const calls = stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    fireEvent.change(field(/Date of birth/), { target: { value: '1985-02-03' } })
    await user.click(field('Male'))
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    await user.click(screen.getByRole('button', { name: /Book appointment/ }))
    await screen.findByText(/Appointment booked/)
    const p = posted(calls).patient
    expect(p).toMatchObject({ dob: '1985-02-03', gender: 'MALE' })
    expect(p.dobApproximate).toBeUndefined()
  })
})

describe('the length of a visit (staff)', () => {
  const minutes = () => screen.getByTestId('visit-minutes').textContent
  const longer = () => screen.getByRole('button', { name: 'Longer by one slot' }) as HTMLButtonElement
  const shorter = () => screen.getByRole('button', { name: 'Shorter by one slot' }) as HTMLButtonElement

  it('starts at one slot and goes up and down by one slot at a time', async () => {
    stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    expect(screen.queryByTestId('visit-minutes')).toBeNull()
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    expect(minutes()).toBe('15 min')
    expect(shorter().disabled).toBe(true)
    await user.click(longer()); expect(minutes()).toBe('30 min')
    await user.click(longer()); expect(minutes()).toBe('45 min')
    await user.click(shorter()); expect(minutes()).toBe('30 min')
    expect(screen.getByText('09:00 AM to 09:30 AM')).toBeTruthy()
  })

  it('stops where the free time stops', async () => {
    stubBooking([0, 1, 3]) // 09:30 is not free
    const user = userEvent.setup()
    await openNewPatientForm(user)
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    await user.click(longer())
    expect(minutes()).toBe('30 min')
    expect(longer().disabled).toBe(true)
    expect(screen.getByText(/next slot is not free/)).toBeTruthy()
  })

  it('books the whole length: the end time is the start plus the chosen length', async () => {
    const calls = stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    await user.type(field(/^Age/), '36'); await user.click(field('Female'))
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    await user.click(longer()); await user.click(longer())
    await user.click(screen.getByRole('button', { name: /Book appointment/ }))
    await screen.findByText(/Appointment booked/)
    const body = posted(calls)
    expect(body.startTime).toBe(slotAt(0).start)
    expect(body.endTime).toBe(slotAt(2).end)
    expect(screen.getByText(/45 min/)).toBeTruthy()
  })

  it('goes back to one slot when another time is picked', async () => {
    stubBooking(); const user = userEvent.setup()
    await openNewPatientForm(user)
    await user.click(await screen.findByRole('button', { name: '09:00 AM' }))
    await user.click(longer()); await user.click(longer())
    await user.click(screen.getByRole('button', { name: '09:15 AM' }))
    expect(minutes()).toBe('15 min')
  })
})

describe("a patient's own booking form", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<RegisterClient config={{ enableChiefComplaint: false, enableMedicalHistory: false }} />)
    await user.type(field(/Full Name/), 'Meera Joshi')
    await user.type(field(/Mobile Number/), '9811100000')
  }

  it('works out the date of birth from the age, like Quick prescription', async () => {
    const user = userEvent.setup(); await fill(user)
    await user.type(field(/^Age/), '36')
    expect(field(/Date of birth/).value).not.toBe('')
    fireEvent.change(field(/Date of birth/), { target: { value: '1985-02-03' } })
    expect(Number(field(/^Age/).value)).toBeGreaterThan(30)
  })

  it('needs a gender, and passes it on with the details', async () => {
    const user = userEvent.setup(); await fill(user)
    await user.type(field(/^Age/), '36')
    await user.click(screen.getByRole('button', { name: /Continue to Book/ }))
    expect(await screen.findByText(/fill in all required fields/)).toBeTruthy()
    expect(nav.replace).not.toHaveBeenCalled()

    await user.click(field('Other'))
    await user.click(screen.getByRole('button', { name: /Continue to Book/ }))
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/book'))
    expect(getDraft()!.patient).toMatchObject({ name: 'Meera Joshi', phone: '+919811100000', gender: 'OTHER', dobApproximate: true })
    expect(getDraft()!.patient.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the calendar', () => {
  const NOW = new Date('2026-11-05T09:00:00Z') // 14:30 IST
  const appt = (id: string, name: string, startIso: string, status = 'COMPLETED') => ({
    id, status, startTime: startIso, endTime: new Date(new Date(startIso).getTime() + 15 * 60_000).toISOString(),
    patient: { id: `p-${id}`, name, phone: '+919800000001', dob: '1990-05-01T00:00:00.000Z' },
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  })
  afterEach(() => vi.useRealTimers())

  const stubCalendar = (appointments: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/doctor/appointments')) return Response.json({ appointments })
    if (url.startsWith('/api/doctor/blocked-slots')) return Response.json({ blocks: [] })
    throw new Error('unexpected request ' + url)
  }))

  it('shows visits that are already over today, next to the ones still to come', async () => {
    stubCalendar([
      appt('a1', 'Earlier Today', '2026-11-05T04:00:00Z'), // 09:30 IST, over
      appt('a2', 'Later Today', '2026-11-05T11:00:00Z', 'BOOKED'),
      appt('a3', 'Called Off', '2026-11-05T05:00:00Z', 'CANCELLED'),
    ])
    render(<CalendarPage />)
    expect(await screen.findByText('Earlier Today')).toBeTruthy()
    expect(screen.getByText('Later Today')).toBeTruthy()
    expect(screen.queryByText('Called Off')).toBeNull() // cancelled visits stay out of the way
  })

  it('can go back to earlier weeks, asking for that week\'s visits', async () => {
    stubCalendar([])
    const user = userEvent.setup({ advanceTimers: () => {} })
    render(<CalendarPage />)
    const prev = (await screen.findByRole('button', { name: 'Previous 7 days' })) as HTMLButtonElement
    expect(prev.disabled).toBe(false)
    await user.click(prev)
    await waitFor(() => {
      const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0])).filter(u => u.startsWith('/api/doctor/appointments'))
      expect(urls.length).toBeGreaterThan(1)
      expect(new Date(new URL(urls[urls.length - 1], 'http://x').searchParams.get('to')!).getTime()).toBeLessThan(NOW.getTime())
    })
  })

  it('shows how long a visit is', async () => {
    stubCalendar([{ ...appt('a1', 'Long Visit', '2026-11-05T11:00:00Z', 'BOOKED'), endTime: '2026-11-05T11:45:00Z' }])
    render(<CalendarPage />)
    await screen.findByText('Long Visit')
    expect(screen.getByText('45 min')).toBeTruthy()
  })
})
