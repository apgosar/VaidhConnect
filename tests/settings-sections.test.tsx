// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach, type Mock } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { PasswordSection } from '@/components/doctor/settings/PasswordSection'
import { VideosSection } from '@/components/doctor/settings/VideosSection'
import { PrintingSection, type PrintingValue } from '@/components/doctor/settings/PrintingSection'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ResponsiveTable', () => {
  type Row = { when: string; who: string; id: number }
  const rows: Row[] = [{ when: '02 Nov', who: 'asha@example.com', id: 1 }, { when: '03 Nov', who: 'ravi@example.com', id: 2 }]
  const columns = [
    { label: 'When', render: (r: Row) => r.when },
    { label: 'Who', render: (r: Row) => r.who },
    { label: 'Id', render: (r: Row) => r.id, hideOnCard: true },
  ]

  it('renders a real table with headers for wide screens', () => {
    render(<ResponsiveTable caption="Activity" columns={columns} rows={rows} rowKey={r => r.id} />)
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map(h => h.textContent)).toEqual(['When', 'Who', 'Id'])
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(3) // header + 2
  })

  it('also renders a card per row for phones, labelled, leaving out hidden columns', () => {
    render(<ResponsiveTable caption="Activity" columns={columns} rows={rows} rowKey={r => r.id} />)
    const list = screen.getByRole('list', { name: 'Activity', hidden: true })
    const cards = within(list).getAllByRole('listitem', { hidden: true })
    expect(cards).toHaveLength(2)
    expect(cards[0].textContent).toContain('When')
    expect(cards[0].textContent).toContain('asha@example.com')
    expect(cards[0].textContent).not.toContain('Id')
  })

  it('switches layout with CSS only, so nothing scrolls sideways on a phone', () => {
    const { container } = render(<ResponsiveTable columns={columns} rows={rows} rowKey={r => r.id} />)
    expect(container.querySelector('.hidden.md\\:block')).not.toBeNull() // the table
    expect(container.querySelector('ul.md\\:hidden')).not.toBeNull() // the cards
  })

  it('says so when there is nothing to show', () => {
    render(<ResponsiveTable columns={columns} rows={[]} rowKey={r => r.id} empty="Nothing recorded yet." />)
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy()
    expect(screen.queryByRole('table', { hidden: true })).toBeNull()
  })
})

describe('PasswordSection', () => {
  const fill = async (cur: string, next: string, conf: string) => {
    await userEvent.type(screen.getByLabelText(/Current Password/), cur)
    await userEvent.type(screen.getByLabelText(/^New Password/), next)
    await userEvent.type(screen.getByLabelText(/Confirm New Password/), conf)
  }
  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Update Password' }))

  it('every field has a name and the new password explains the rule', () => {
    render(<PasswordSection />)
    for (const l of [/Current Password/, /^New Password/, /Confirm New Password/]) expect(screen.getByLabelText(l)).toBeTruthy()
    expect(screen.getByText('At least 10 characters')).toBeTruthy()
  })

  it('refuses mismatched passwords without calling the server', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy)
    render(<PasswordSection />)
    await fill('oldpassword1', 'brand-new-password', 'something-else-here')
    await submit()
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords do not match')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the server\'s reason when it refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Current password is incorrect' }), { status: 403 })))
    render(<PasswordSection />)
    await fill('wrongpassword', 'brand-new-password', 'brand-new-password')
    await submit()
    expect((await screen.findByRole('alert')).textContent).toBe('Current password is incorrect')
  })

  it('tells the doctor they will be signed out after a successful change', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetchSpy)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PasswordSection />)
    await fill('oldpassword1', 'brand-new-password', 'brand-new-password')
    await submit()
    expect((await screen.findByRole('status')).textContent).toContain('Signing you out')
    const body = JSON.parse((fetchSpy.mock.calls[0] as any)[1].body)
    expect(body).toEqual({ currentPassword: 'oldpassword1', newPassword: 'brand-new-password' })
    vi.useRealTimers()
  })

  it('reports a network failure in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<PasswordSection />)
    await fill('oldpassword1', 'brand-new-password', 'brand-new-password')
    await submit()
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the server')
  })
})

describe('VideosSection', () => {
  it('lists, edits, adds and removes links', async () => {
    const onChange = vi.fn()
    render(<VideosSection links={['https://youtu.be/a', 'https://youtu.be/b']} onChange={onChange} />)
    expect(screen.getByLabelText('YouTube link 2')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('YouTube link 1'), { target: { value: 'https://youtu.be/new' } })
    expect(onChange).toHaveBeenLastCalledWith(['https://youtu.be/new', 'https://youtu.be/b'])

    await userEvent.click(screen.getByRole('button', { name: 'Remove YouTube link 1' }))
    expect(onChange).toHaveBeenLastCalledWith(['https://youtu.be/b'])

    await userEvent.click(screen.getByRole('button', { name: '+ Add YouTube Link' }))
    expect(onChange).toHaveBeenLastCalledWith(['https://youtu.be/a', 'https://youtu.be/b', ''])
  })
})

describe('PrintingSection', () => {
  const file = () => new File([new Uint8Array([1, 2, 3])], 'letterhead.png', { type: 'image/png' })
  let onChange: Mock<(patch: PrintingValue) => void>
  beforeEach(() => { onChange = vi.fn<(patch: PrintingValue) => void>() })

  it('shows the default spacing and passes back the full set when one value changes', () => {
    render(<PrintingSection value={{}} onChange={onChange} />)
    expect((screen.getByLabelText('Top (mm)') as HTMLInputElement).value).toBe('45')
    fireEvent.change(screen.getByLabelText('Left (mm)'), { target: { value: '22' } })
    expect(onChange).toHaveBeenLastCalledWith({ printSettings: { top: 45, bottom: 25, left: 22, right: 15 } })
  })

  it('keeps the doctor\'s saved spacing', () => {
    render(<PrintingSection value={{ printSettings: { top: 60, bottom: 20, left: 10, right: 12 } }} onChange={onChange} />)
    expect((screen.getByLabelText('Top (mm)') as HTMLInputElement).value).toBe('60')
    expect((screen.getByLabelText('Right (mm)') as HTMLInputElement).value).toBe('12')
  })

  it('uploads a letterhead and reports the stored path', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ doctor: { letterheadPath: 'letterheads/x.png' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    render(<PrintingSection value={{}} onChange={onChange} />)
    await userEvent.upload(screen.getByLabelText('Choose a letterhead image'), file())
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ letterheadPath: 'letterheads/x.png' }))
    expect((fetchSpy.mock.calls[0] as any)[1].body.get('letterhead').name).toBe('letterhead.png')
  })

  it('shows why an upload was refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'The letterhead should be a portrait A4 page' }), { status: 400 })))
    render(<PrintingSection value={{}} onChange={onChange} />)
    await userEvent.upload(screen.getByLabelText('Choose a letterhead image'), file())
    expect((await screen.findByRole('alert')).textContent).toContain('portrait A4')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('asks before removing, and only removes when confirmed', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetchSpy)
    render(<PrintingSection value={{ letterheadPath: 'letterheads/x.png' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Remove/ }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove the letterhead?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fetchSpy).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Remove/ }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ letterheadPath: null }))
    expect(JSON.parse((fetchSpy.mock.calls[0] as any)[1].body)).toEqual({ removeLetterhead: true })
  })

  it('offers the test pages for both layouts', () => {
    render(<PrintingSection value={{}} onChange={onChange} />)
    expect(screen.getByRole('link', { name: /Print a test page/ }).getAttribute('href')).toBe('/api/doctor/print-test?mode=preprinted')
    expect(screen.getByRole('link', { name: /Preview standard layout/ }).getAttribute('href')).toBe('/api/doctor/print-test?mode=standard')
  })
})
