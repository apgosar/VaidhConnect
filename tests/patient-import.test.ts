import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: async () => true }))

import { POST } from '@/app/api/doctor/patients/import/route'
import { checkRow, importPhone, isRejected, mapHeaders, parseCsv, parseDate } from '@/lib/patientImport'

const call = async (csv: string, extra: Record<string, unknown> = {}) =>
  (await POST(new Request('http://x/api/doctor/patients/import', { method: 'POST', body: JSON.stringify({ csv, ...extra }) })))!
const patients = async () => (await h.db.col('patients').get()).docs.map((d: any) => d.data())

const HEAD = 'id,name,gender,dob,phone\n'
beforeEach(() => { h.db = fakeTenantDb(new FakeFirestore()); h.session = { uid: 'u1', role: 'OWNER' } })

describe('reading the file', () => {
  it('handles quotes, a BOM and Windows line ends', () => {
    expect(parseCsv('﻿name,note\r\n"Shah, Amit","said ""hi"""\r\n\r\n')).toEqual([['name', 'note'], ['Shah, Amit', 'said "hi"']])
  })
  it('finds columns by common names, and asks for name, phone and a date of birth or age', () => {
    expect(mapHeaders(['Patient Name', 'Mobile', 'Sex', 'Date of Birth'])).toEqual({ columns: { name: 0, phone: 1, gender: 2, dob: 3 } })
    expect('error' in mapHeaders(['name', 'gender'])).toBe(true)
    expect('error' in mapHeaders(['name', 'phone'])).toBe(true)
  })
  it('accepts dates written the usual ways and refuses impossible ones', () => {
    expect(parseDate('04-11-2006')).toBe('2006-11-04')
    expect(parseDate('4/1/1990')).toBe('1990-01-04')
    expect(parseDate('1990-01-04')).toBe('1990-01-04')
    expect(parseDate('31-02-1990')).toBeNull()
    expect(parseDate('soon')).toBeNull()
  })
  it('turns Indian mobiles into +91 form and refuses the rest', () => {
    expect(importPhone('9167490692')).toBe('+919167490692')
    expect(importPhone('+91 91674 90692')).toBe('+919167490692')
    expect(importPhone('919167490692')).toBe('+919167490692')
    expect(importPhone('0797734165')).toBeNull()
    expect(importPhone('12345')).toBeNull()
  })
  it('turns an age into the 1 June estimate', () => {
    const cols = mapHeaders(['name', 'phone', 'age']) as any
    const r = checkRow(['Asha Rao', '9876543210', '40'], cols.columns, 2, '2026-11-04', false)
    expect(isRejected(r)).toBe(false)
    expect(r).toMatchObject({ dob: '1986-06-01', dobApproximate: true })
  })
  it('says why a line is refused', () => {
    const cols = (mapHeaders(['name', 'phone', 'gender', 'dob']) as any).columns
    const why = (cells: string[]) => (checkRow(cells, cols, 2, '2026-11-04', false) as any).reason
    expect(why(['A', '9876543210', 'F', '01-01-1990'])).toMatch(/name/)
    expect(why(['Asha', '0797734165', 'F', '01-01-1990'])).toMatch(/mobile/)
    expect(why(['Asha', '9876543210', 'X', '01-01-1990'])).toMatch(/gender/)
    expect(why(['Asha', '9876543210', 'F', '01-01-2099'])).toMatch(/future/)
    expect(why(['Asha', '9876543210', 'F', ''])).toMatch(/date of birth or age/)
  })
})

describe('the import', () => {
  const file = HEAD + [
    '1,Saanvi Saraogi,F,04-11-2006,9167490692',
    '2,Ankur Gosar,M,03-11-1991,9773776803',
    '3,Ankur Gosar,M,03-11-1991,9773776803',
    '4,Dhanraj Shah,M,08-09-1985,0797734165',
    '5,Hasna Mehta,Female,29-10-1976,9321854328',
  ].join('\n')

  it('previews without saving anything', async () => {
    const res = await call(file)
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ committed: false, total: 5, newCount: 3, repeatedCount: 1, rejectedCount: 1, existingCount: 0 })
    expect(j.rejected[0]).toMatchObject({ line: 5, name: 'Dhanraj Shah' })
    expect(await patients()).toHaveLength(0)
  })

  it('adds the new patients with gender, an estimated birth date and where they came from', async () => {
    const j = await (await call(file, { commit: true })).json()
    expect(j).toMatchObject({ committed: true, added: 3 })
    const all = await patients()
    const s = all.find((p: any) => p.name === 'Saanvi Saraogi')
    expect(s).toMatchObject({ phone: '+919167490692', gender: 'FEMALE', dobApproximate: true, createdBy: 'import:u1', legacyId: '1' })
    expect(s.dob.toDate().toISOString().slice(0, 10)).toBe('2006-11-04')
  })

  it('is safe to run twice: nobody is added again', async () => {
    await call(file, { commit: true })
    const j = await (await call(file, { commit: true })).json()
    expect(j).toMatchObject({ added: 0, existingCount: 4 })
    expect(await patients()).toHaveLength(3)
  })

  it('keeps people who share a number but have different names', async () => {
    const csv = HEAD + '1,Rajesh Mehta,M,10-03-1983,9821098205\n2,Vimalaben Mehta,F,24-05-1941,9821098205'
    expect((await (await call(csv, { commit: true })).json()).added).toBe(2)
  })

  it('does not touch a patient who is already here, even with other details', async () => {
    await h.db.col('patients').doc('p1').set({ name: 'ankur gosar', phone: '+919773776803', dob: new Date('1990-01-01T00:00:00Z'), medicalHistory: 'Asthma' })
    const j = await (await call(file, { commit: true })).json()
    expect(j.added).toBe(2)
    expect((await h.db.col('patients').doc('p1').get()).data().medicalHistory).toBe('Asthma')
  })

  it('refuses a file with no usable columns, and a staff member', async () => {
    expect((await call('name,gender\nA,F')).status).toBe(400)
    h.session = { uid: 'u2', role: 'STAFF' }
    expect((await call(file)).status).toBe(403)
    h.session = null
    expect((await call(file)).status).toBe(401)
  })

  it('imports more than one write batch worth', async () => {
    const lines = Array.from({ length: 950 }, (_, i) => `${i},Patient ${i}x,M,01-01-1990,9${String(100000000 + i)}`)
    const j = await (await call(HEAD + lines.join('\n'), { commit: true })).json()
    expect(j.added).toBe(950)
    expect(await patients()).toHaveLength(950)
  })
})
