import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))

import { BlockError, MAX_REPEATS, createBlocks, deleteBlock, findConflicts, listUpcomingBlocks, parseWhen, updateBlock } from '@/lib/modules/blocks'
import { parseClinicLocal, toClinicLocal } from '@/lib/time'

const kolkata = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const newYork = { ...kolkata, timezone: 'America/New_York' }

// Thu 5 Nov 2026, 10:00 in Kolkata
const NOW = new Date('2026-11-05T04:30:00Z')
let fs: FakeFirestore
const blocksColl = () => [...fs.coll('clinics/c1/blocked_slots').values()]
const iso = (v: any) => (v?.toDate ? v.toDate() : v).toISOString()
const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e: any) { return e } }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  fs = new FakeFirestore(); h.db = fakeTenantDb(fs)
})
afterEach(() => vi.useRealTimers())

const putBlock = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
  fs.collection('clinics/c1/blocked_slots').doc(id).set({ doctorId: 'c1', startTime: new Date(start), endTime: new Date(end), reason: null, ...extra })

describe('clinic-local times', () => {
  it('reads a datetime-local value as the clinic\'s wall clock, whatever the machine\'s timezone', () => {
    expect(parseClinicLocal('2026-11-06T14:30', 'Asia/Kolkata')!.toISOString()).toBe('2026-11-06T09:00:00.000Z')
    expect(parseClinicLocal('2026-11-06T14:30', 'America/New_York')!.toISOString()).toBe('2026-11-06T19:30:00.000Z')
  })
  it('rejects malformed values', () => {
    for (const bad of ['', '2026-11-06', '2026-11-06T25:00', '2026-11-06T10:61', '2026-02-31T10:00', 'tomorrow', '2026-11-06 10:00']) expect(parseClinicLocal(bad, 'Asia/Kolkata'), bad).toBeNull()
  })
  it('round-trips through toClinicLocal, including midnight', () => {
    for (const v of ['2026-11-06T14:30', '2026-11-06T00:00', '2026-12-31T23:59']) expect(toClinicLocal(parseClinicLocal(v, 'Asia/Kolkata')!, 'Asia/Kolkata')).toBe(v)
  })
  it('parseWhen also accepts an ISO time with an offset, and nothing else', () => {
    expect(parseWhen('2026-11-06T09:00:00Z', 'Asia/Kolkata')!.toISOString()).toBe('2026-11-06T09:00:00.000Z')
    expect(parseWhen('2026-11-06T14:30:00+05:30', 'America/New_York')!.toISOString()).toBe('2026-11-06T09:00:00.000Z')
    expect(parseWhen('2026-11-06T14:30:00', 'Asia/Kolkata')).toBeNull() // seconds but no offset: ambiguous
    expect(parseWhen(42, 'Asia/Kolkata')).toBeNull()
  })
})

describe('createBlocks', () => {
  it('stores the hours the doctor typed in the clinic\'s time, with a trimmed reason', async () => {
    const { blocks } = await createBlocks(kolkata, { start: '2026-11-06T14:30', end: '2026-11-06T16:00', reason: '  Surgery  ' }, NOW)
    expect(blocks).toHaveLength(1)
    const stored = blocksColl()[0]
    expect(iso(stored.startTime)).toBe('2026-11-06T09:00:00.000Z')
    expect(iso(stored.endTime)).toBe('2026-11-06T10:30:00.000Z')
    expect(stored.reason).toBe('Surgery')
    expect(stored.doctorId).toBe('c1')
  })

  it('refuses an end that is not after the start, a period that is over, a huge span and nonsense', async () => {
    expect(await err(createBlocks(kolkata, { start: '2026-11-06T14:30', end: '2026-11-06T14:30' }, NOW))).toMatchObject({ status: 400, message: 'End time must be after start time' })
    expect(await err(createBlocks(kolkata, { start: '2026-11-01T10:00', end: '2026-11-02T10:00' }, NOW))).toMatchObject({ status: 400, message: 'That period has already passed' })
    expect(await err(createBlocks(kolkata, { start: '2026-11-06T10:00', end: '2028-11-06T10:00' }, NOW))).toMatchObject({ status: 400 })
    expect(await err(createBlocks(kolkata, { start: 'soon', end: 'later' }, NOW))).toBeInstanceOf(BlockError)
    expect(blocksColl()).toHaveLength(0)
  })

  it('allows a block that has already started but not finished', async () => {
    await expect(createBlocks(kolkata, { start: '2026-11-05T09:00', end: '2026-11-05T12:00' }, NOW)).resolves.toBeTruthy()
  })

  it('reports booked appointments inside the block without cancelling them', async () => {
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001' })
    await fs.collection('clinics/c1/appointments').doc('a1').set({ patientId: 'p1', doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-06T09:30:00Z'), endTime: new Date('2026-11-06T10:00:00Z') })
    await fs.collection('clinics/c1/appointments').doc('a2').set({ patientId: 'p1', doctorId: 'c1', status: 'CANCELLED', startTime: new Date('2026-11-06T09:00:00Z'), endTime: new Date('2026-11-06T09:30:00Z') })
    await fs.collection('clinics/c1/appointments').doc('a3').set({ patientId: 'p1', doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-06T11:00:00Z'), endTime: new Date('2026-11-06T11:30:00Z') })
    const { conflicts } = await createBlocks(kolkata, { start: '2026-11-06T14:30', end: '2026-11-06T16:00' }, NOW)
    expect(conflicts.map(c => c.id)).toEqual(['a1'])
    expect(conflicts[0].patientName).toBe('Asha Rao')
    expect(fs.coll('clinics/c1/appointments').get('a1')!.status).toBe('BOOKED')
  })

  it('catches an appointment that began before the block and runs into it', async () => {
    await fs.collection('clinics/c1/appointments').doc('a1').set({ doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-06T08:45:00Z'), endTime: new Date('2026-11-06T09:15:00Z') })
    expect((await findConflicts(h.db, new Date('2026-11-06T09:00:00Z'), new Date('2026-11-06T10:00:00Z'))).map(c => c.id)).toEqual(['a1'])
    expect(await findConflicts(h.db, new Date('2026-11-06T09:15:00Z'), new Date('2026-11-06T10:00:00Z'))).toEqual([]) // touching is not overlapping
  })
})

describe('weekly series', () => {
  it('creates one block per week up to and including the end date, sharing a series id', async () => {
    const { blocks } = await createBlocks(kolkata, { start: '2026-11-08T13:00', end: '2026-11-08T14:00', reason: 'Lunch', repeat: { until: '2026-11-29' } }, NOW)
    expect(blocks.map(b => toClinicLocal(b.startTime, 'Asia/Kolkata'))).toEqual(['2026-11-08T13:00', '2026-11-15T13:00', '2026-11-22T13:00', '2026-11-29T13:00'])
    expect(new Set(blocks.map(b => b.seriesId)).size).toBe(1)
    expect(blocks[0].seriesId).toBeTruthy()
    expect(blocksColl()).toHaveLength(4)
  })

  it('keeps the same clock time across a daylight-saving change', async () => {
    // New York leaves DST on Sun 1 Nov 2026: 09:00 stays 09:00 on the wall, the UTC hour moves
    const { blocks } = await createBlocks(newYork, { start: '2026-10-28T09:00', end: '2026-10-28T10:00', repeat: { until: '2026-11-11' } }, new Date('2026-10-27T00:00:00Z'))
    expect(blocks.map(b => toClinicLocal(b.startTime, 'America/New_York'))).toEqual(['2026-10-28T09:00', '2026-11-04T09:00', '2026-11-11T09:00'])
    expect(blocks.map(b => b.startTime.toISOString().slice(11, 16))).toEqual(['13:00', '14:00', '14:00'])
  })

  it('repeats a multi-day block with the same shape', async () => {
    const { blocks } = await createBlocks(kolkata, { start: '2026-11-06T18:00', end: '2026-11-09T09:00', repeat: { until: '2026-11-13' } }, NOW)
    expect(blocks.map(b => [toClinicLocal(b.startTime, 'Asia/Kolkata'), toClinicLocal(b.endTime, 'Asia/Kolkata')])).toEqual([
      ['2026-11-06T18:00', '2026-11-09T09:00'],
      ['2026-11-13T18:00', '2026-11-16T09:00'],
    ])
  })

  it('refuses an end date before the start, a malformed one, and a repeat longer than a year', async () => {
    expect(await err(createBlocks(kolkata, { start: '2026-11-08T13:00', end: '2026-11-08T14:00', repeat: { until: '2026-11-01' } }, NOW))).toMatchObject({ status: 400 })
    expect(await err(createBlocks(kolkata, { start: '2026-11-08T13:00', end: '2026-11-08T14:00', repeat: { until: '2026-13-45' } }, NOW))).toMatchObject({ status: 400 })
    const tooLong = await err(createBlocks(kolkata, { start: '2026-11-08T13:00', end: '2026-11-08T14:00', repeat: { until: '2028-11-08' } }, NOW))
    expect(tooLong).toMatchObject({ status: 400 })
    expect(tooLong.message).toContain(String(MAX_REPEATS))
    expect(blocksColl()).toHaveLength(0)
  })

  it('reports each booked appointment once even if blocks overlap them twice', async () => {
    await fs.collection('clinics/c1/appointments').doc('a1').set({ doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-15T07:45:00Z'), endTime: new Date('2026-11-15T08:15:00Z') })
    const { conflicts } = await createBlocks(kolkata, { start: '2026-11-08T13:00', end: '2026-11-08T14:00', repeat: { until: '2026-11-22' } }, NOW)
    expect(conflicts.map(c => c.id)).toEqual(['a1'])
  })
})

describe('listUpcomingBlocks (what the Block Schedule page shows)', () => {
  it('hides blocks that are over, shows the one in progress and the future ones, soonest first', async () => {
    await putBlock('yesterday', '2026-11-04T04:00:00Z', '2026-11-04T08:00:00Z')
    await putBlock('earlier-today', '2026-11-05T01:00:00Z', '2026-11-05T03:00:00Z')   // ended 08:30 IST
    await putBlock('running', '2026-11-05T03:00:00Z', '2026-11-05T09:00:00Z')          // 08:30-14:30 IST, now 10:00
    await putBlock('later', '2026-11-20T04:00:00Z', '2026-11-20T08:00:00Z')
    await putBlock('tomorrow', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z')
    expect((await listUpcomingBlocks(kolkata, NOW)).map(b => b.id)).toEqual(['running', 'tomorrow', 'later'])
  })

  it('shows a multi-day block that started in the past and is still running', async () => {
    await putBlock('long', '2026-11-01T04:00:00Z', '2026-11-08T04:00:00Z')
    expect((await listUpcomingBlocks(kolkata, NOW)).map(b => b.id)).toEqual(['long'])
  })

  it('is empty when nothing is coming up', async () => {
    await putBlock('old', '2026-10-01T04:00:00Z', '2026-10-01T08:00:00Z')
    expect(await listUpcomingBlocks(kolkata, NOW)).toEqual([])
  })

  it('ignores another clinic\'s block that somehow sits in this collection', async () => {
    await putBlock('mine', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z')
    await putBlock('foreign', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { doctorId: 'someone-else' })
    expect((await listUpcomingBlocks(kolkata, NOW)).map(b => b.id)).toEqual(['mine'])
  })

  it('attaches the booked appointments each block covers', async () => {
    await putBlock('b1', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z')
    await putBlock('b2', '2026-11-10T04:00:00Z', '2026-11-10T08:00:00Z')
    await fs.collection('clinics/c1/patients').doc('p1').set({ name: 'Asha Rao' })
    await fs.collection('clinics/c1/appointments').doc('a1').set({ patientId: 'p1', doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-06T05:00:00Z'), endTime: new Date('2026-11-06T05:30:00Z') })
    await fs.collection('clinics/c1/appointments').doc('a2').set({ patientId: 'p1', doctorId: 'c1', status: 'COMPLETED', startTime: new Date('2026-11-06T06:00:00Z'), endTime: new Date('2026-11-06T06:30:00Z') })
    const [b1, b2] = await listUpcomingBlocks(kolkata, NOW)
    expect(b1.conflicts.map(c => [c.id, c.patientName])).toEqual([['a1', 'Asha Rao']])
    expect(b2.conflicts).toEqual([])
  })
})

describe('updateBlock', () => {
  it('changes the time and reason', async () => {
    await putBlock('b1', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { reason: 'Old', seriesId: 's1' })
    const b = await updateBlock(kolkata, 'b1', { start: '2026-11-07T10:00', end: '2026-11-07T12:00', reason: 'New' }, NOW)
    expect(iso(b.startTime)).toBe('2026-11-07T04:30:00.000Z')
    expect(b.reason).toBe('New')
    expect(b.seriesId).toBe('s1') // an edited occurrence stays in its series
    expect(iso(fs.coll('clinics/c1/blocked_slots').get('b1')!.startTime)).toBe('2026-11-07T04:30:00.000Z')
  })

  it('clears the reason when it is emptied', async () => {
    await putBlock('b1', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { reason: 'Old' })
    expect((await updateBlock(kolkata, 'b1', { start: '2026-11-06T09:30', end: '2026-11-06T13:30', reason: '   ' }, NOW)).reason).toBeNull()
  })

  it('applies the same checks as creating, and reports appointments the new time covers', async () => {
    await putBlock('b1', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z')
    expect(await err(updateBlock(kolkata, 'b1', { start: '2026-11-07T12:00', end: '2026-11-07T10:00' }, NOW))).toMatchObject({ status: 400 })
    expect(await err(updateBlock(kolkata, 'b1', { start: 'x', end: 'y' }, NOW))).toMatchObject({ status: 400 })
    await fs.collection('clinics/c1/appointments').doc('a1').set({ doctorId: 'c1', status: 'BOOKED', startTime: new Date('2026-11-07T05:00:00Z'), endTime: new Date('2026-11-07T05:30:00Z') })
    expect((await updateBlock(kolkata, 'b1', { start: '2026-11-07T10:00', end: '2026-11-07T12:00' }, NOW)).conflicts.map(c => c.id)).toEqual(['a1'])
  })

  it('404s for an unknown block or another clinic\'s block', async () => {
    await putBlock('foreign', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { doctorId: 'other' })
    expect(await err(updateBlock(kolkata, 'nope', { start: '2026-11-07T10:00', end: '2026-11-07T12:00' }, NOW))).toMatchObject({ status: 404 })
    expect(await err(updateBlock(kolkata, 'foreign', { start: '2026-11-07T10:00', end: '2026-11-07T12:00' }, NOW))).toMatchObject({ status: 404 })
  })
})

describe('deleteBlock', () => {
  it('removes just one block by default', async () => {
    await putBlock('a', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { seriesId: 's' })
    await putBlock('b', '2026-11-13T04:00:00Z', '2026-11-13T08:00:00Z', { seriesId: 's' })
    expect(await deleteBlock(kolkata, 'a', 'this', NOW)).toBe(1)
    expect([...fs.coll('clinics/c1/blocked_slots').keys()]).toEqual(['b'])
  })

  it('removes the rest of a weekly series but leaves earlier occurrences alone', async () => {
    await putBlock('past', '2026-10-30T04:00:00Z', '2026-10-30T08:00:00Z', { seriesId: 's' })
    await putBlock('now', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z', { seriesId: 's' })
    await putBlock('next', '2026-11-13T04:00:00Z', '2026-11-13T08:00:00Z', { seriesId: 's' })
    await putBlock('other-series', '2026-11-13T04:00:00Z', '2026-11-13T08:00:00Z', { seriesId: 'z' })
    expect(await deleteBlock(kolkata, 'now', 'series', NOW)).toBe(2)
    expect([...fs.coll('clinics/c1/blocked_slots').keys()].sort()).toEqual(['other-series', 'past'])
  })

  it('a block with no series is removed alone even when "series" is asked for', async () => {
    await putBlock('solo', '2026-11-06T04:00:00Z', '2026-11-06T08:00:00Z')
    expect(await deleteBlock(kolkata, 'solo', 'series', NOW)).toBe(1)
    expect(blocksColl()).toHaveLength(0)
  })

  it('404s for an unknown block', async () => {
    expect(await err(deleteBlock(kolkata, 'nope', 'this', NOW))).toMatchObject({ status: 404 })
  })
})

describe('a block stops bookings', () => {
  it('slots inside a block created through createBlocks are no longer offered', async () => {
    const { getDayAvailability } = await import('@/lib/modules/availability')
    const open = { open: true, morning: { start: '09:00', end: '13:00' }, evening: null }
    const timings = { monday: open, tuesday: open, wednesday: open, thursday: open, friday: open, saturday: open, sunday: open } as any
    const doctor = { id: 'c1', timings, slotDurationMins: 30 }
    const before = await getDayAvailability(kolkata, h.db, doctor, '2026-11-06', NOW)
    expect(before.slots.length).toBe(8)
    await createBlocks(kolkata, { start: '2026-11-06T10:00', end: '2026-11-06T11:00', reason: 'Surgery' }, NOW)
    const after = await getDayAvailability(kolkata, h.db, doctor, '2026-11-06', NOW)
    expect(after.slots.map(s => s.label)).not.toContain('10:00 AM')
    expect(after.slots.map(s => s.label)).not.toContain('10:30 AM')
    expect(after.slots.length).toBe(6)
    expect(after.blockedPeriods[0].reason).toBe('Surgery')
  })
})
