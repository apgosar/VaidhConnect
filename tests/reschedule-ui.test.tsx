// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SlotPicker, type Slot } from '@/components/booking/SlotPicker'
import { RescheduleDialog } from '@/components/booking/RescheduleDialog'
import { useState } from 'react'

const slots: Slot[] = [
  { start: '2026-11-06T03:30:00.000Z', end: '2026-11-06T04:00:00.000Z', label: '09:00 AM' },
  { start: '2026-11-06T04:00:00.000Z', end: '2026-11-06T04:30:00.000Z', label: '09:30 AM' },
]

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>
function stubServer(routes: { slots?: Route; reschedule?: Route } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('/api/public/config')) return Response.json({ config: { timezone: 'Asia/Kolkata', today: '2026-11-05' } })
    if (url.startsWith('/api/appointments?mode=slots')) return routes.slots ? routes.slots(url, init) : Response.json({ slots, blockedPeriods: [], slotDurationMins: 30 })
    if (url.includes('/reschedule')) return routes.reschedule ? routes.reschedule(url, init) : Response.json({ appointment: { id: 'a1' } })
    throw new Error('unexpected request ' + url)
  }))
  return calls
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Picker({ refreshKey }: { refreshKey?: number }) {
  const [v, setV] = useState<Slot | null>(null)
  return <><SlotPicker value={v} onChange={setV} refreshKey={refreshKey} /><output data-testid="chosen">{v?.label ?? 'none'}</output></>
}

describe('SlotPicker', () => {
  it('starts on the clinic\'s today and lists that day\'s open times', async () => {
    const calls = stubServer()
    render(<Picker />)
    expect(await screen.findByRole('button', { name: '09:00 AM' })).toBeTruthy()
    expect(calls.some(c => c.url === '/api/appointments?mode=slots&date=2026-11-05')).toBe(true)
    expect(screen.getByRole('button', { name: /Thursday 5 Nov, today/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('button', { name: /Nov/ })).toHaveLength(14)
  })

  it('choosing a time selects it; choosing another day loads that day and clears the choice', async () => {
    const calls = stubServer()
    render(<Picker />)
    await userEvent.click(await screen.findByRole('button', { name: '09:30 AM' }))
    expect(screen.getByTestId('chosen').textContent).toBe('09:30 AM')
    expect(screen.getByRole('button', { name: '09:30 AM' }).getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(screen.getByRole('button', { name: /Friday 6 Nov/ }))
    await waitFor(() => expect(calls.some(c => c.url.endsWith('date=2026-11-06'))).toBe(true))
    expect(screen.getByTestId('chosen').textContent).toBe('none')
  })

  it('explains why time is missing when the doctor has blocked part of the day', async () => {
    stubServer({ slots: () => Response.json({ slots, blockedPeriods: [{ startTime: '2026-11-05T06:30:00.000Z', endTime: '2026-11-05T07:30:00.000Z', reason: 'Surgery' }], slotDurationMins: 30 }) })
    render(<Picker />)
    expect((await screen.findByRole('alert')).textContent).toContain('Doctor unavailable 12:00 PM – 01:00 PM (Surgery)')
  })

  it('says so when a day has no times, and when loading fails', async () => {
    stubServer({ slots: () => Response.json({ slots: [], blockedPeriods: [] }) })
    const { unmount } = render(<Picker />)
    expect(await screen.findByText('No times are available on this day.')).toBeTruthy()
    unmount()
    stubServer({ slots: () => new Response('{}', { status: 500 }) })
    render(<Picker />)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the available times')
  })

  it('reloads the day when asked to (the chosen time was taken)', async () => {
    const calls = stubServer()
    const { rerender } = render(<Picker refreshKey={0} />)
    await screen.findByRole('button', { name: '09:00 AM' })
    const before = calls.filter(c => c.url.startsWith('/api/appointments?mode=slots')).length
    rerender(<Picker refreshKey={1} />)
    await waitFor(() => expect(calls.filter(c => c.url.startsWith('/api/appointments?mode=slots')).length).toBe(before + 1))
  })
})

describe('RescheduleDialog', () => {
  const open = (props: Partial<React.ComponentProps<typeof RescheduleDialog>> = {}) => {
    const onClose = vi.fn(), onMoved = vi.fn()
    render(<RescheduleDialog open appointmentId="a1" currentLabel="05 Nov 2026, 10:00 AM" patientName="Asha Rao" onClose={onClose} onMoved={onMoved} {...props} />)
    return { onClose, onMoved }
  }
  const choose = async (name = '09:30 AM') => userEvent.click(await screen.findByRole('button', { name }))
  const move = () => userEvent.click(screen.getByRole('button', { name: 'Move appointment' }))

  beforeEach(() => { stubServer() })

  it('names the person and the current time, and the move button waits for a choice', async () => {
    open({ hint: 'You can move this appointment 2 more times.' })
    const dialog = screen.getByRole('dialog', { name: 'Choose a new time' })
    expect(dialog.textContent).toContain('Asha Rao')
    expect(dialog.textContent).toContain('05 Nov 2026, 10:00 AM')
    expect(dialog.textContent).toContain('2 more times')
    expect((screen.getByRole('button', { name: 'Move appointment' }) as HTMLButtonElement).disabled).toBe(true)
    await choose()
    expect((screen.getByRole('button', { name: 'Move appointment' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('sends the chosen slot and reports success', async () => {
    const calls = stubServer()
    const { onMoved } = open()
    await choose('09:30 AM')
    await move()
    await waitFor(() => expect(onMoved).toHaveBeenCalledOnce())
    const post = calls.find(c => c.url === '/api/appointments/a1/reschedule')!
    expect(post.init?.method).toBe('POST')
    expect(JSON.parse(post.init!.body as string)).toEqual({ startTime: slots[1].start, endTime: slots[1].end })
  })

  it('when the time was just taken: says so, clears the choice and reloads the day', async () => {
    const calls = stubServer({ reschedule: () => Response.json({ error: 'This slot is no longer available', code: 'SLOT_TAKEN' }, { status: 409 }) })
    const { onMoved } = open()
    await choose()
    const slotCalls = () => calls.filter(c => c.url.startsWith('/api/appointments?mode=slots')).length
    const before = slotCalls()
    await move()
    expect((await screen.findByRole('alert')).textContent).toContain('no longer available')
    expect(onMoved).not.toHaveBeenCalled()
    await waitFor(() => expect(slotCalls()).toBe(before + 1))
    expect((screen.getByRole('button', { name: 'Move appointment' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the server\'s reason when the move is not allowed', async () => {
    stubServer({ reschedule: () => Response.json({ error: 'This appointment has already been moved 2 times. Please call the clinic to change it again.', code: 'RESCHEDULE_NOT_ALLOWED' }, { status: 409 }) })
    open()
    await choose(); await move()
    expect((await screen.findByRole('alert')).textContent).toContain('already been moved 2 times')
  })

  it('reports a network failure in plain words', async () => {
    stubServer({ reschedule: () => { throw new Error('offline') } })
    open()
    await choose(); await move()
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the server')
  })

  it('"Keep the current time" and Escape close it without moving anything', async () => {
    const calls = stubServer()
    const a = open()
    await userEvent.click(screen.getByRole('button', { name: 'Keep the current time' }))
    expect(a.onClose).toHaveBeenCalledOnce()
    cleanup()
    const b = open()
    await userEvent.keyboard('{Escape}')
    expect(b.onClose).toHaveBeenCalledOnce()
    expect(calls.some(c => c.url.includes('/reschedule'))).toBe(false)
  })

  it('renders nothing when closed', () => {
    open({ open: false })
    expect(within(document.body).queryByRole('dialog')).toBeNull()
  })
})
