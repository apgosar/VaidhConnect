// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MedicineList, emptyMedicine } from '@/components/doctor/MedicineList'
import type { Medicine } from '@/lib/constants'

const PARA = { name: 'Paracetamol 500', dosage: '1 tablet', frequency: 'Twice daily', duration: '5 days', instructions: 'After food', uses: 9 }
const PRED = { name: 'Prednisolone', dosage: '', frequency: '', duration: '', taper: { steps: [{ dose: '40 mg', frequency: 'Once daily', days: 5 }, { dose: '20 mg', frequency: 'Once daily', days: 5 }] }, uses: 3 }

function Harness() {
  const [meds, setMeds] = useState<Medicine[]>([emptyMedicine()])
  return <MedicineList medicines={meds} onChange={setMeds} />
}
const stub = () => vi.stubGlobal('fetch', vi.fn(async (url: string) =>
  Response.json({ medicines: [PARA, PRED].filter(m => m.name.toLowerCase().startsWith(new URL(url, 'http://x').searchParams.get('q')!.toLowerCase())) })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('medicine name dropdown', () => {
  it('shows remembered medicines as you type, with how they were last prescribed', async () => {
    stub()
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Medicine name'), 'par')
    const option = await screen.findByRole('option', { name: /Paracetamol 500/ })
    expect(option.textContent).toContain('1 tablet · Twice daily · 5 days')
  })

  it('fills every remembered field when one is chosen', async () => {
    stub()
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Medicine name'), 'par')
    await user.click(await screen.findByRole('option', { name: /Paracetamol 500/ }))
    expect(screen.getByLabelText('Medicine name')).toHaveProperty('value', 'Paracetamol 500')
    expect(screen.getByLabelText('Dosage')).toHaveProperty('value', '1 tablet')
    expect(screen.getByLabelText('Instructions')).toHaveProperty('value', 'After food')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('brings back a tapering course as a tapering course', async () => {
    stub()
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Medicine name'), 'pre')
    const option = await screen.findByRole('option', { name: /Prednisolone/ })
    expect(option.textContent).toContain('Tapering · 2 steps')
    await user.click(option)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tapering dose' }).getAttribute('aria-pressed')).toBe('true'))
    expect(screen.getByDisplayValue('40 mg')).toBeTruthy()
  })

  it('works from the keyboard', async () => {
    stub()
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Medicine name'), 'par')
    await screen.findByRole('option', { name: /Paracetamol 500/ })
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByLabelText('Medicine name')).toHaveProperty('value', 'Paracetamol 500')
  })
})
