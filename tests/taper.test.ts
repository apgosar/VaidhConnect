import { describe, it, expect } from 'vitest'
import { taperSchedule, taperTotalDays, dayRangeLabel, MAX_TAPER_STEPS } from '@/lib/taper'
import { parseMargins, marginsOrDefault, parsePrintMode, mmToPt, DEFAULT_MARGINS } from '@/lib/pdf/layout'

describe('taper schedule', () => {
  const steps = [
    { dose: '40 mg', frequency: 'Once daily', days: 5 },
    { dose: '20 mg', frequency: 'Once daily', days: 5 },
    { dose: '10 mg', frequency: 'Alternate days', days: 1 },
  ]

  it('lays the steps out back to back from day 1', () => {
    const lines = taperSchedule(steps)
    expect(lines.map(l => [l.from, l.to])).toEqual([[1, 5], [6, 10], [11, 11]])
    expect(taperTotalDays(steps)).toBe(11)
  })

  it('labels single days and ranges', () => {
    const lines = taperSchedule(steps)
    expect(lines.map(dayRangeLabel)).toEqual(['Day 1-5', 'Day 6-10', 'Day 11'])
  })

  it('mends nonsense day counts to at least one day', () => {
    const lines = taperSchedule([{ dose: 'x', frequency: '', days: 0 }, { dose: 'y', frequency: '', days: NaN as any }, { dose: 'z', frequency: '', days: 2.9 }])
    expect(lines.map(l => l.days)).toEqual([1, 1, 2])
    expect(lines[2].to).toBe(4)
  })

  it('has no steps, no days', () => {
    expect(taperSchedule([])).toEqual([])
    expect(taperTotalDays([])).toBe(0)
    expect(MAX_TAPER_STEPS).toBe(12)
  })
})

describe('print margins', () => {
  it('accepts a full, in-range set and rounds to half millimetres', () => {
    expect(parseMargins({ top: '45.2', bottom: 25, left: 15, right: 15 })).toEqual({ top: 45, bottom: 25, left: 15, right: 15 })
  })
  it('rejects missing, non-numeric and out-of-range values', () => {
    expect(parseMargins({ top: 45, bottom: 25, left: 15 })).toBeUndefined()
    expect(parseMargins({ top: 'a', bottom: 25, left: 15, right: 15 })).toBeUndefined()
    expect(parseMargins({ top: 121, bottom: 25, left: 15, right: 15 })).toBeUndefined()
    expect(parseMargins({ top: 45, bottom: -1, left: 15, right: 15 })).toBeUndefined()
    expect(parseMargins(null)).toBeUndefined()
  })
  it('falls back to the defaults for anything stored badly', () => {
    expect(marginsOrDefault(undefined)).toEqual(DEFAULT_MARGINS)
    expect(marginsOrDefault({ top: 'x' })).toEqual(DEFAULT_MARGINS)
  })
  it('converts millimetres to points and reads the print mode safely', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72)
    expect(parsePrintMode('preprinted')).toBe('preprinted')
    expect(parsePrintMode('anything else')).toBe('standard')
    expect(parsePrintMode(null)).toBe('standard')
  })
})
