import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any, files: new Map<string, Buffer>() }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/lib/storage', () => ({
  tenantPath: (t: { clinicId: string }, p: string) => `clinics/${t.clinicId}/${p}`,
  uploadFile: vi.fn(async (b: Buffer, path: string) => { h.files.set(path, b); return path }),
  deleteFile: vi.fn(async (path: string) => { h.files.delete(path) }),
  getSignedDownloadUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
  downloadFile: async () => null,
}))

import { POST } from '@/app/api/prescriptions/route'
import { PATCH as patchProfile } from '@/app/api/doctor/profile/route'
import { POST as addScanRoute, GET as listScanRoute } from '@/app/api/appointments/[id]/rx-scans/route'
import { DELETE as deleteScanRoute } from '@/app/api/appointments/[id]/rx-scans/[scanId]/route'
import { cleanAdviceOptions, adviceOptionsOrDefault } from '@/lib/advice'
import { DEFAULT_ADVICE } from '@/lib/constants'
import { MAX_SCANS_PER_VISIT } from '@/lib/modules/rxScans'
import { PrescriptionDocument, type PrescriptionDocProps } from '@/lib/pdf/prescriptionDocument'
import { rxToPayload, emptyRx, rxFromStored, rxSnapshot } from '@/lib/rxContent'

const VISIT = new Date('2026-11-02T04:30:00Z')
const med = { name: 'Paracetamol', dosage: '500 mg', frequency: 'BD', duration: '3 days' }

const save = async (body: Record<string, unknown>) =>
  (await POST(new Request('http://x/api/prescriptions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appointmentId: 'a1', patientId: 'p1', medicines: [med], ...body }),
  })))!
const stored = async () => (await h.db.col('prescriptions').get()).docs.map((d: any) => d.data())

beforeEach(async () => {
  h.db = fakeTenantDb(new FakeFirestore()); h.session = { uid: 'u1', role: 'DOCTOR' }; h.files.clear()
  await h.db.col('appointments').doc('a1').set({ patientId: 'p1', startTime: VISIT })
})

describe('the examination, investigations and advice of a prescription', () => {
  it('saves them, trimmed, next to the medicines', async () => {
    const res = await save({
      onExamination: '  BP 120/80, pulse 76  ', investigations: ' CBC, HbA1c ',
      advice: ['Avoid outside food', ' Drink plenty of water '], adviceOther: ' Cut down on tea ',
    })
    expect(res.status).toBe(201)
    expect((await stored())[0]).toMatchObject({
      onExamination: 'BP 120/80, pulse 76', investigations: 'CBC, HbA1c',
      advice: ['Avoid outside food', 'Drink plenty of water'], adviceOther: 'Cut down on tea',
    })
  })

  it('clears them again when they are sent blank on a later save', async () => {
    await save({ onExamination: 'BP 120/80', investigations: 'CBC', advice: ['Avoid outside food'], adviceOther: 'Rest' })
    await save({ onExamination: '', investigations: null, advice: [], adviceOther: '   ' })
    expect((await stored())[0]).toMatchObject({ onExamination: null, investigations: null, advice: [], adviceOther: null })
    expect(await stored()).toHaveLength(1)
  })

  it('still saves a prescription that has none of them (an older client)', async () => {
    expect((await save({})).status).toBe(201)
    expect((await stored())[0]).toMatchObject({ onExamination: null, investigations: null, advice: [], adviceOther: null })
  })

  it('rejects advice that is not a list of short texts', async () => {
    expect((await save({ advice: 'Avoid outside food' })).status).toBe(400)
    expect((await save({ advice: ['x'.repeat(201)] })).status).toBe(400)
  })
})

describe('the form values', () => {
  it('sends blank text as null and only medicines that have a name', () => {
    const rx = { ...emptyRx(), onExamination: '  ', diagnosis: ' Flu ', medicines: [med, { name: '  ', dosage: '', frequency: '', duration: '' }] }
    expect(rxToPayload(rx)).toMatchObject({ onExamination: null, diagnosis: 'Flu', medicines: [med], advice: [] })
  })

  it('reads a stored prescription back into the form, and an older one without the new fields', () => {
    const old = rxFromStored({ diagnosis: 'Flu', medicines: [med], notes: 'Rest' }, 'Fever')
    expect(old).toMatchObject({ chiefComplaint: 'Fever', diagnosis: 'Flu', onExamination: '', investigations: '', advice: [], adviceOther: '', notes: 'Rest' })
    expect(rxSnapshot(old)).toBe(rxSnapshot(rxFromStored({ diagnosis: 'Flu', medicines: [med], notes: 'Rest', onExamination: null }, 'Fever')))
  })
})

describe('the clinic advice list', () => {
  it('trims, drops blanks and repeats, and refuses what is too long or not a list', () => {
    expect(cleanAdviceOptions(['  Avoid  outside food ', '', 'avoid outside food', 'Rest'])).toEqual(['Avoid outside food', 'Rest'])
    expect(cleanAdviceOptions('Rest')).toBeNull()
    expect(cleanAdviceOptions([1])).toBeNull()
    expect(cleanAdviceOptions(['x'.repeat(201)])).toBeNull()
    expect(cleanAdviceOptions(Array.from({ length: 41 }, (_, i) => `Advice ${i}`))).toBeNull()
  })

  it('uses the starter list until the clinic makes its own, even when its own is empty', () => {
    expect(adviceOptionsOrDefault(undefined)).toEqual([...DEFAULT_ADVICE])
    expect(adviceOptionsOrDefault([])).toEqual([])
    expect(adviceOptionsOrDefault(['Rest'])).toEqual(['Rest'])
  })

  it('is saved from Settings, cleaned, and a bad list is refused', async () => {
    await h.db.profile().set({ name: 'Dr A', clinicName: 'C' })
    const patch = (body: unknown) => patchProfile(new Request('http://x/api/doctor/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    h.session = { uid: 'u1', role: 'OWNER' }
    expect((await patch({ adviceOptions: [' Rest ', 'rest', 'Walk daily'] }))!.status).toBe(200)
    expect((await h.db.profile().get()).data().adviceOptions).toEqual(['Rest', 'Walk daily'])
    expect((await patch({ adviceOptions: 'Rest' }))!.status).toBe(400)
  })
})

// Every piece of text placed on the page (the PDF stores glyphs, not words).
function textOf(node: any): string[] {
  if (node == null || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(textOf)
  return textOf(node.props?.children)
}
const doc = (prescription: Partial<PrescriptionDocProps['prescription']> = {}): PrescriptionDocProps => ({
  prescription: { id: 'rx12345678', diagnosis: 'Flu', medicines: [med], ...prescription },
  patient: { name: 'Asha Rao', phone: '+919800000001', age: '36 years' },
  visit: { dateText: '02 Nov 2026' },
  doctor: { name: 'A', clinicName: 'Clinic' },
})
const words = (p: Partial<PrescriptionDocProps['prescription']>) => textOf(PrescriptionDocument(doc(p))).join(' | ')

describe('the new sections on the printed prescription', () => {
  it('prints each one under its heading when there is something to say', () => {
    const t = words({ onExamination: 'BP 120/80', investigations: 'CBC, HbA1c', advice: ['Avoid outside food'], adviceOther: 'Cut down on tea' })
    expect(t).toContain('On Examination (O/E)')
    expect(t).toContain('BP 120/80')
    expect(t).toContain('Advised Investigations')
    expect(t).toContain('CBC, HbA1c')
    expect(t).toContain('Advice')
    expect(t).toContain('Avoid outside food')
    expect(t).toContain('Cut down on tea')
  })

  it('leaves out a section entirely, heading and all, when it is empty', () => {
    for (const blank of [undefined, null, '', '   ']) {
      const t = words({ onExamination: blank, investigations: blank, adviceOther: blank, advice: [] })
      expect(t).not.toContain('On Examination')
      expect(t).not.toContain('Advised Investigations')
      expect(t).not.toContain('| Advice |')
    }
  })

  it('prints advice that is only written in words, with no ticked items', () => {
    expect(words({ advice: [], adviceOther: 'Rest for two days' })).toContain('Rest for two days')
  })
})

describe('photos of a handwritten prescription', () => {
  const photo = (w = 400, h2 = 600) => sharp({ create: { width: w, height: h2, channels: 3, background: '#888' } }).jpeg().toBuffer()
  const upload = async (files: Buffer[], id = 'a1') => {
    const fd = new FormData()
    for (const f of files) fd.append('photo', new File([new Uint8Array(f)], 'p.jpg', { type: 'image/jpeg' }))
    return (await addScanRoute(new Request('http://x', { method: 'POST', body: fd }), { params: Promise.resolve({ id }) }))!
  }
  const list = async () => (await (await listScanRoute(new Request('http://x'), { params: Promise.resolve({ id: 'a1' }) }))!.json()).scans as { id: string; url: string }[]

  it('stores a private, upright JPEG with the visit and lists it with a short-lived link', async () => {
    const res = await upload([await photo()])
    expect(res.status).toBe(201)
    const scans = await list()
    expect(scans).toHaveLength(1)
    expect(scans[0].url).toMatch(/^https:\/\/signed\.example\/clinics\/c1\/rx-scans\/a1\//)
    const [path] = [...h.files.keys()]
    expect((await sharp(h.files.get(path)!).metadata()).format).toBe('jpeg')
  })

  it('shrinks a very large photo', async () => {
    await upload([await photo(4000, 6000)])
    const [path] = [...h.files.keys()]
    const meta = await sharp(h.files.get(path)!).metadata()
    expect(Math.max(meta.width!, meta.height!)).toBe(2200)
  })

  it('takes several photos at once', async () => {
    expect((await upload([await photo(), await photo(), await photo()])).status).toBe(201)
    expect(await list()).toHaveLength(3)
  })

  it('refuses a file that is not a photo, however it is labelled', async () => {
    const res = await upload([Buffer.from('%PDF-1.4 not a photo')])
    expect(res.status).toBe(400)
    expect(h.files.size).toBe(0)
  })

  it('stops at the limit and leaves no stray file behind', async () => {
    const one = await photo()
    for (let i = 0; i < MAX_SCANS_PER_VISIT; i++) expect((await upload([one])).status).toBe(201)
    const res = await upload([one])
    expect(res.status).toBe(400)
    expect(h.files.size).toBe(MAX_SCANS_PER_VISIT)
  })

  it('removes one photo, from the record and from storage', async () => {
    await upload([await photo(), await photo()])
    const [first] = await list()
    const res = (await deleteScanRoute(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'a1', scanId: first.id }) }))!
    expect(res.status).toBe(200)
    expect(await list()).toHaveLength(1)
    expect(h.files.size).toBe(1)
  })

  it('says 404 for an appointment or photo that does not exist', async () => {
    expect((await upload([await photo()], 'nope')).status).toBe(404)
    const res = (await deleteScanRoute(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'a1', scanId: 'missing' }) }))!
    expect(res.status).toBe(404)
  })

  it('is for doctors only: signed out and front-desk staff are turned away', async () => {
    h.session = null
    expect((await upload([await photo()])).status).toBe(401)
    h.session = { uid: 'u2', role: 'RECEPTIONIST' }
    expect((await upload([await photo()])).status).toBe(403)
    expect((await listScanRoute(new Request('http://x'), { params: Promise.resolve({ id: 'a1' }) }))!.status).toBe(403)
  })

  it('never hands the storage paths to the browser through the appointment itself', async () => {
    h.session = { uid: 'u1', role: 'DOCTOR' }
    await upload([await photo()])
    const { GET } = await import('@/app/api/appointments/[id]/route')
    const res = (await GET(new Request('http://x'), { params: Promise.resolve({ id: 'a1' }) }))!
    expect(JSON.stringify(await res.json())).not.toContain('rx-scans')
  })
})
