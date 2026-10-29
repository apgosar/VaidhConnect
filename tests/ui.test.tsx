// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

import { Alert } from '@/components/ui/Alert'
import { Field, TextField, TextAreaField, SelectField } from '@/components/ui/Field'
import { ConfirmDialog, useConfirm } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageShell, Container } from '@/components/ui/PageShell'
import { Button, LinkButton } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { LoadingBlock, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Section } from '@/components/ui/Card'

afterEach(() => { cleanup(); document.body.style.overflow = '' })

describe('Alert', () => {
  it('interrupts screen readers for errors and warnings, and waits its turn for success and info', () => {
    render(<><Alert variant="error">Bad</Alert><Alert variant="warning">Careful</Alert><Alert variant="success">Done</Alert><Alert variant="info">FYI</Alert></>)
    expect(screen.getByText('Bad').closest('[role]')?.getAttribute('role')).toBe('alert')
    expect(screen.getByText('Careful').closest('[role]')?.getAttribute('role')).toBe('alert')
    expect(screen.getByText('Done').closest('[role]')?.getAttribute('role')).toBe('status')
    expect(screen.getByText('FYI').closest('[role]')?.getAttribute('role')).toBe('status')
  })
  it('defaults to an error and hides its icon from assistive technology', () => {
    const { container } = render(<Alert>Oops</Alert>)
    expect(container.querySelector('.alert-error')).not.toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Field', () => {
  it('ties the label to the control so the control has an accessible name', () => {
    render(<TextField label="Mobile number" />)
    expect(screen.getByLabelText('Mobile number').tagName).toBe('INPUT')
  })

  it('works for textareas and selects too', () => {
    render(<><TextAreaField label="Notes" /><SelectField label="Role"><option>Doctor</option></SelectField></>)
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('Role').tagName).toBe('SELECT')
  })

  it('reads the hint and the error with the control, and marks it invalid', () => {
    render(<TextField label="PIN" hint="Four digits" error="Too easy to guess" />)
    const input = screen.getByLabelText('PIN')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const described = input.getAttribute('aria-describedby')!.split(' ').map(id => document.getElementById(id)?.textContent)
    expect(described).toEqual(['Four digits', 'Too easy to guess'])
    expect(screen.getByRole('alert').textContent).toBe('Too easy to guess')
  })

  it('has no aria-invalid or description when there is nothing to say', () => {
    render(<TextField label="Name" />)
    const input = screen.getByLabelText('Name')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(input.hasAttribute('aria-describedby')).toBe(false)
  })

  it('marks required fields for assistive technology without reading the asterisk', () => {
    render(<TextField label="Name" required />)
    const input = screen.getByLabelText(/Name/)
    expect(input.getAttribute('aria-required')).toBe('true')
    expect((input as HTMLInputElement).required).toBe(true)
    expect(document.querySelector('label span[aria-hidden="true"]')?.textContent?.trim()).toBe('*')
  })

  it('gives every field its own id, even when two share a label', () => {
    render(<><TextField label="Name" /><TextField label="Name" /></>)
    const ids = screen.getAllByLabelText('Name').map(e => e.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('renders any control through the render function', () => {
    render(<Field label="Colour">{c => <input type="color" {...c} />}</Field>)
    expect(screen.getByLabelText('Colour').getAttribute('type')).toBe('color')
  })
})

describe('ConfirmDialog', () => {
  const open = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
    const onConfirm = vi.fn(), onCancel = vi.fn()
    render(<><button>Opener</button><ConfirmDialog open title="Remove it?" message="This cannot be undone." onConfirm={onConfirm} onCancel={onCancel} {...props} /></>)
    return { onConfirm, onCancel }
  }

  it('is an alert dialog, named by its title and described by its message', () => {
    open()
    const dialog = screen.getByRole('alertdialog', { name: 'Remove it?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('This cannot be undone.')
  })

  it('renders nothing when closed', () => {
    open({ open: false })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('starts on the confirm button, but on Cancel for a destructive action', () => {
    open()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm' }))
    cleanup()
    open({ danger: true, confirmLabel: 'Remove' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('Escape cancels', async () => {
    const { onCancel, onConfirm } = open()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    open()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    confirm.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(cancel) // wrapped to the first
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(confirm) // wrapped to the last
  })

  it('the buttons confirm or cancel, and clicking outside cancels', async () => {
    const a = open()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(a.onConfirm).toHaveBeenCalledOnce()
    cleanup()
    const b = open()
    fireEvent.mouseDown(document.querySelector('.modal-backdrop')!)
    expect(b.onCancel).toHaveBeenCalledOnce()
  })

  it('locks page scroll while open and gives focus back to what opened it', () => {
    function Host() {
      const [o, setO] = useState(false)
      return <><button onClick={() => setO(true)}>Opener</button><ConfirmDialog open={o} title="Sure?" onConfirm={() => setO(false)} onCancel={() => setO(false)} /></>
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener)
  })
})

describe('useConfirm', () => {
  function Host({ result }: { result: (ok: boolean) => void }) {
    const { confirm, dialog } = useConfirm()
    return <><button onClick={async () => result(await confirm({ title: 'Delete?', danger: true, confirmLabel: 'Delete' }))}>Go</button>{dialog}</>
  }

  it('resolves true when confirmed and false when cancelled, then closes', async () => {
    const result = vi.fn()
    render(<Host result={result} />)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(result).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    await act(async () => { await userEvent.keyboard('{Escape}') })
    expect(result).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('PageHeader', () => {
  it('shows a labelled Home link by default', () => {
    render(<PageHeader title="My Appointments" subtitle="+91 98765 43210" />)
    expect(screen.getByRole('heading', { level: 1, name: 'My Appointments' })).toBeTruthy()
    const home = screen.getByRole('link', { name: 'Back to home' })
    expect(home.getAttribute('href')).toBe('/')
    expect(home.textContent).toContain('Home')
    expect(screen.getByText('+91 98765 43210')).toBeTruthy()
  })

  it('offers Back instead of Home inside a flow, and nothing when there is nowhere to go', async () => {
    const onBack = vi.fn()
    const { unmount } = render(<PageHeader title="Confirm" onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link')).toBeNull()
    unmount()
    render(<PageHeader title="Welcome" homeHref={null} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a control on the right', () => {
    render(<PageHeader title="X" right={<button>Sign out</button>} />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })
})

describe('PageShell and Container', () => {
  it('is the main landmark the skip link points to', () => {
    render(<PageShell><p>hi</p></PageShell>)
    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
  })
  it('picks the container width class', () => {
    const { container } = render(<><Container><i /></Container><Container width="wide"><i /></Container></>)
    expect(container.querySelector('.container-narrow')).not.toBeNull()
    expect(container.querySelector('.container-wide')).not.toBeNull()
  })
})

describe('Button and LinkButton', () => {
  it('a loading button is disabled, busy and shows a spinner, so it cannot be double-clicked', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save</Button>)
    const b = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status')).toBeTruthy()
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('maps variant and size to the shared classes, and never submits a form by accident', () => {
    render(<form><Button variant="danger" size="lg" block>Delete</Button></form>)
    const b = screen.getByRole('button', { name: 'Delete' })
    expect(b.className).toContain('btn-danger')
    expect(b.className).toContain('btn-lg')
    expect(b.className).toContain('w-full')
    expect(b.getAttribute('type')).toBe('button')
  })

  it('a link button is a real link', () => {
    render(<LinkButton href="/book" variant="outline">Book</LinkButton>)
    const a = screen.getByRole('link', { name: 'Book' })
    expect(a.getAttribute('href')).toBe('/book')
    expect(a.className).toContain('btn-outline')
  })
})

describe('Badge, Spinner, EmptyState, Section', () => {
  it('appointment statuses always carry text and the same colour', () => {
    render(<><StatusBadge status="BOOKED" /><StatusBadge status="NO_SHOW" /><StatusBadge status="CANCELLED" /><Badge tone="green">Paid</Badge></>)
    expect(screen.getByText('BOOKED').className).toContain('badge-blue')
    expect(screen.getByText('NO SHOW').className).toContain('badge-amber')
    expect(screen.getByText('CANCELLED').className).toContain('badge-red')
    expect(screen.getByText('Paid').className).toContain('badge-green')
  })

  it('a spinner has an accessible name', () => {
    render(<><Spinner /><LoadingBlock label="Loading slots" /></>)
    expect(screen.getAllByRole('status').map(e => e.getAttribute('aria-label'))).toEqual(['Loading', 'Loading slots'])
  })

  it('an empty state shows its title, hint and action', () => {
    render(<EmptyState title="No appointments" hint="Book one to get started" action={<button>Book</button>} icon={<svg />} />)
    expect(screen.getByText('No appointments')).toBeTruthy()
    expect(screen.getByText('Book one to get started')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Book' })).toBeTruthy()
  })

  it('a section has a heading', () => {
    render(<Section title="Payment details" description="Shown to patients"><p>x</p></Section>)
    expect(screen.getByRole('heading', { level: 2, name: 'Payment details' })).toBeTruthy()
  })
})

import { Switch } from '@/components/ui/Switch'
import { LangText } from '@/components/ui/LangText'

describe('Switch', () => {
  it('is a real switch button that reports on/off and flips with click, Space and Enter', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Enable chief complaint" />)
    const sw = screen.getByRole('switch', { name: 'Enable chief complaint' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(sw)
    expect(onChange).toHaveBeenLastCalledWith(true)

    rerender(<Switch checked onChange={onChange} label="Enable chief complaint" />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    screen.getByRole('switch').focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(false)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('takes its name from a wrapping label and cannot be used when disabled', async () => {
    const onChange = vi.fn()
    render(<label>Open on Monday <Switch checked onChange={onChange} disabled /></label>)
    const sw = screen.getByRole('switch', { name: /Open on Monday/ }) as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    await userEvent.click(sw)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('LangText', () => {
  it('tags Gujarati and Hindi text with its language and leaves English alone', () => {
    const { container } = render(<><p><LangText>આશા રાવ</LangText></p><p><LangText>आशा राव</LangText></p><p><LangText>Asha Rao</LangText></p><p><LangText>{null}</LangText></p></>)
    const spans = [...container.querySelectorAll('[lang]')]
    expect(spans.map(s => [s.getAttribute('lang'), s.textContent])).toEqual([['gu', 'આશા રાવ'], ['hi', 'आशा राव']])
    expect(container.textContent).toContain('Asha Rao')
    expect(container.querySelectorAll('p')[2].querySelector('span')).toBeNull()
  })
})
