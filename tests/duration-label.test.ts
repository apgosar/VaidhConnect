import { describe, it, expect } from 'vitest'
import { durationLabel } from '@/lib/slots'

const t = (min: number) => new Date(Date.UTC(2026, 10, 23, 5, min))
describe('durationLabel', () => {
  it('shows minutes, hours, and both', () => {
    expect(durationLabel(t(0), t(15))).toBe('15 min')
    expect(durationLabel(t(0), t(45))).toBe('45 min')
    expect(durationLabel(t(0), t(60))).toBe('1 hr')
    expect(durationLabel(t(0), t(75))).toBe('1 hr 15 min')
  })
  it('accepts ISO strings', () => {
    expect(durationLabel('2026-11-23T05:00:00.000Z', '2026-11-23T05:30:00.000Z')).toBe('30 min')
  })
  it('is empty when times are missing or backwards', () => {
    expect(durationLabel(undefined, t(30))).toBe('')
    expect(durationLabel(t(30), t(30))).toBe('')
    expect(durationLabel(t(30), t(0))).toBe('')
    expect(durationLabel('nope', t(0))).toBe('')
  })
})
