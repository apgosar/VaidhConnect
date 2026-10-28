import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- a tiny in-memory stand-in for the Admin SDK, recording the paths used ---
const docs: Record<string, any[]> = {}
const paths: string[] = []

const makeRef = (path: string): any => ({
  path,
  doc: (id: string) => makeRef(`${path}/${id}`),
  collection: (name: string) => makeRef(`${path}/${name}`),
  get: async () => {
    paths.push(path)
    const list = docs[path]
    // a collection path returns a snapshot; a document path returns one doc
    if (list) return { docs: list.map(d => ({ id: d.id, data: () => d.data })) }
    return { exists: false, data: () => undefined }
  },
})

vi.mock('@/lib/firebase/server', () => ({ adminDb: { collection: (n: string) => makeRef(n) } }))

import { tenantDb } from '@/lib/db/tenant'
import { listTenants } from '@/lib/tenant/list'

beforeEach(() => { paths.length = 0; for (const k of Object.keys(docs)) delete docs[k] })

describe('tenantDb', () => {
  it('keeps legacy clinics on the root collections', () => {
    const db = tenantDb({ clinicId: 'abc', storage: 'legacy', timezone: 'Asia/Kolkata' })
    expect(db.profile().path).toBe('doctors/abc')
    expect(db.col('patients').path).toBe('patients')
  })

  it('puts scoped clinics entirely under their own clinic document', () => {
    const db = tenantDb({ clinicId: 'abc', storage: 'scoped', timezone: 'Asia/Kolkata' })
    expect(db.profile().path).toBe('clinics/abc')
    expect(db.col('patients').path).toBe('clinics/abc/patients')
    expect(db.col('appointments').doc('x').path).toBe('clinics/abc/appointments/x')
  })

  it('can never address another clinic\'s data through the same accessor', () => {
    const a = tenantDb({ clinicId: 'a', storage: 'scoped', timezone: 'UTC' })
    const b = tenantDb({ clinicId: 'b', storage: 'scoped', timezone: 'UTC' })
    expect(a.col('patients').path).not.toBe(b.col('patients').path)
  })
})

describe('listTenants', () => {
  const doc = (id: string, data: any = {}) => ({ id, data })

  it('lists legacy and scoped clinics with their timezones', async () => {
    docs['doctors'] = [doc('old', { timezone: 'Asia/Kolkata' })]
    docs['clinics'] = [doc('new', { timezone: 'Asia/Dubai' })]
    docs['domains'] = []
    const t = await listTenants()
    expect(t).toContainEqual({ clinicId: 'old', storage: 'legacy', timezone: 'Asia/Kolkata' })
    expect(t).toContainEqual({ clinicId: 'new', storage: 'scoped', timezone: 'Asia/Dubai' })
  })

  it('keeps a mid-migration clinic on legacy until its domain is cut over', async () => {
    docs['doctors'] = [doc('c1')]
    docs['clinics'] = [doc('c1')]
    docs['domains'] = [doc('c1.example.in', { clinicId: 'c1', storage: 'legacy' })]
    expect((await listTenants()).find(t => t.clinicId === 'c1')?.storage).toBe('legacy')

    docs['domains'] = [doc('c1.example.in', { clinicId: 'c1', storage: 'scoped' })]
    const after = await listTenants()
    expect(after.filter(t => t.clinicId === 'c1')).toHaveLength(1)
    expect(after.find(t => t.clinicId === 'c1')?.storage).toBe('scoped')
  })

  it('defaults a missing timezone to Asia/Kolkata', async () => {
    docs['doctors'] = [doc('x')]; docs['clinics'] = []; docs['domains'] = []
    expect((await listTenants())[0].timezone).toBe('Asia/Kolkata')
  })
})
