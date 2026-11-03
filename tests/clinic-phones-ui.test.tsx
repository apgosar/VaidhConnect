// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { ClinicPhonesField } from '@/components/doctor/settings/ClinicPhonesField'
import { MAX_CLINIC_PHONES } from '@/lib/clinicPhones'

afterEach(cleanup)

function Harness({ initial = [] as string[], lockFirst = false }) {
  const [value, setValue] = useState(initial)
  return <><ClinicPhonesField value={value} lockFirst={lockFirst} onChange={setValue} /><output data-testid="out">{JSON.stringify(value)}</output></>
}
const out = () => JSON.parse(screen.getByTestId('out').textContent!) as string[]

describe('the clinic phone numbers in Settings', () => {
  it('starts with one box, and no remove button while there is only one', () => {
    render(<Harness />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Remove phone/ })).toBeNull()
  })

  it('adds another number, and the new box is there to type in', async () => {
    const user = userEvent.setup(); render(<Harness initial={['+91 98765 43210']} />)
    await user.click(screen.getByRole('button', { name: /Add another number/ }))
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    await user.type(screen.getByLabelText('Clinic phone 2'), '+91 91234 56789')
    expect(out()).toEqual(['+91 98765 43210', '+91 91234 56789'])
  })

  it('removes a number', async () => {
    const user = userEvent.setup(); render(<Harness initial={['+91 1', '+91 2', '+91 3']} />)
    await user.click(screen.getByRole('button', { name: 'Remove phone 2' }))
    expect(out()).toEqual(['+91 1', '+91 3'])
  })

  it('stops offering to add at the limit', () => {
    render(<Harness initial={Array.from({ length: MAX_CLINIC_PHONES }, (_, i) => `+91 9000${i}`)} />)
    expect(screen.queryByRole('button', { name: /Add another number/ })).toBeNull()
  })

  it('shows the main number as fixed when it follows the Dr. WhatsApp number, but the others stay editable', () => {
    render(<Harness initial={['+91 1', '+91 2']} lockFirst />)
    expect((screen.getByLabelText('Clinic phone, main number') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Clinic phone 2') as HTMLInputElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Remove phone 1' })).toBeNull()
  })
})
