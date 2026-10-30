import { describe, it, expect } from 'vitest'
import { describeBlock, wholeDays, blockPresets } from '@/lib/blockLabel'
import { parseClinicLocal } from '@/lib/time'

const tz = 'Asia/Kolkata'
const at = (v: string) => parseClinicLocal(v, tz)!

describe('describeBlock', () => {
  it('names whole days', () => {
    expect(describeBlock(at('2026-11-17T00:00'), at('2026-11-18T00:00'), tz)).toEqual({ allDay: true, text: 'All day · Tue 17 Nov' })
    expect(describeBlock(at('2026-11-17T00:00'), at('2026-11-19T00:00'), tz)).toEqual({ allDay: true, text: 'All day · Tue 17 Nov – Wed 18 Nov' })
  })
  it('shows the hours within a day, in the clinic\'s time', () => {
    expect(describeBlock(at('2026-11-17T14:00'), at('2026-11-17T16:30'), tz)).toEqual({ allDay: false, text: 'Tue 17 Nov, 02:00 PM – 04:30 PM' })
  })
  it('shows both ends when it crosses midnight', () => {
    expect(describeBlock(at('2026-11-17T18:00'), at('2026-11-18T09:00'), tz).text).toBe('Tue 17 Nov, 06:00 PM → Wed 18 Nov, 09:00 AM')
  })
  it('does not call midnight-to-midnight-the-same-day all day', () => {
    expect(describeBlock(at('2026-11-17T00:00'), at('2026-11-17T00:00'), tz).allDay).toBe(false)
  })
  it('reads the clinic\'s clock, not the machine\'s', () => {
    const start = new Date('2026-11-17T18:30:00Z') // midnight 18 Nov in Kolkata
    expect(describeBlock(start, new Date('2026-11-18T18:30:00Z'), tz).text).toBe('All day · Wed 18 Nov')
    expect(describeBlock(start, new Date('2026-11-18T18:30:00Z'), 'America/New_York').allDay).toBe(false)
  })
})

describe('wholeDays', () => {
  it('turns whole days back into the form\'s first and last date', () => {
    expect(wholeDays(at('2026-11-17T00:00'), at('2026-11-19T00:00'), tz)).toEqual({ startDate: '2026-11-17', endDate: '2026-11-18' })
  })
  it('is null for a block with hours', () => {
    expect(wholeDays(at('2026-11-17T09:00'), at('2026-11-19T00:00'), tz)).toBeNull()
    expect(wholeDays(at('2026-11-17T00:00'), at('2026-11-17T00:00'), tz)).toBeNull()
  })
})

describe('blockPresets', () => {
  const presets = blockPresets('2026-11-05', '2026-11-05T10:20')
  it('offers the quick choices from the clinic\'s today', () => {
    expect(presets.map(p => p.label)).toEqual(['Rest of today', 'Tomorrow, all day', 'Next 3 days', 'Next 7 days'])
  })
  it('"rest of today" runs from now to midnight; the others are whole days with inclusive end dates', () => {
    expect(presets[0]).toMatchObject({ allDay: false, start: '2026-11-05T10:20', end: '2026-11-06T00:00' })
    expect(presets[1]).toMatchObject({ allDay: true, start: '2026-11-06', end: '2026-11-06' })
    expect(presets[2]).toMatchObject({ start: '2026-11-05', end: '2026-11-07' })
    expect(presets[3]).toMatchObject({ start: '2026-11-05', end: '2026-11-11' })
  })
})
