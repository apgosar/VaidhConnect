import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import sharp from 'sharp'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any, files: new Map<string, Buffer>() }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: async () => true }))
vi.mock('@/lib/storage', () => ({
  tenantPath: (t: { clinicId: string }, p: string) => `clinics/${t.clinicId}/${p}`,
  uploadFile: vi.fn(async (b: Buffer, path: string) => { h.files.set(path, b); return `https://files.example/${path}` }),
  deleteFile: vi.fn(async (url: string) => { h.files.delete(url.replace('https://files.example/', '')) }),
}))

import { GET, POST, PATCH } from '@/app/api/doctor/showcase/route'
import { DELETE } from '@/app/api/doctor/showcase/[id]/route'
import { MAX_SHOWCASE_ITEMS, MAX_SHOWCASE_PDF_PAGES, cleanShowcaseTitle, sniffShowcaseKind, toPublicShowcase } from '@/lib/showcase'

const pdfOf = (pages: number) => renderToBuffer(
  <Document>{Array.from({ length: pages }, (_, i) => <Page key={i} size="A4"><Text>Page {i + 1}</Text></Page>)}</Document>,
)
const png = () => sharp({ create: { width: 40, height: 20, channels: 4, background: '#0b6e4f' } }).png().toBuffer()

const upload = async (data: Buffer, name: string, title?: string) => {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array(data)], name))
  if (title !== undefined) fd.append('title', title)
  return (await POST(new Request('http://x/api/doctor/showcase', { method: 'POST', body: fd })))!
}
const items = async () => (await h.db.profile().get()).data().showcase ?? []

beforeEach(async () => {
  h.db = fakeTenantDb(new FakeFirestore()); h.session = { uid: 'u1', role: 'OWNER' }; h.files.clear()
  await h.db.profile().set({ name: 'Dr A', clinicName: 'C' })
})

describe('helpers', () => {
  it('tell a PDF from a picture by its bytes, and refuse anything else', async () => {
    expect(sniffShowcaseKind(await pdfOf(1))).toBe('pdf')
    expect(sniffShowcaseKind(await png())).toBe('image')
    expect(sniffShowcaseKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull()
    expect(sniffShowcaseKind(Buffer.from('MZ\x90\x00 not a document'))).toBeNull()
  })
  it('tidy a title, or fall back to the file name', () => {
    expect(cleanShowcaseTitle('  Our   treatments ')).toBe('Our treatments')
    expect(cleanShowcaseTitle('', 'dental_care-brochure.pdf')).toBe('dental care brochure')
    expect(cleanShowcaseTitle('x'.repeat(200)).length).toBe(80)
    expect(cleanShowcaseTitle(undefined, '')).toBe('Untitled')
  })
  it('the public view carries no internal fields', () => {
    expect(toPublicShowcase([{ id: 'a', kind: 'image', title: 'T', url: 'u', bytes: 1, createdAt: 'x' }])).toEqual([{ id: 'a', kind: 'image', title: 'T', url: 'u', pages: undefined, bytes: 1 }])
    expect(toPublicShowcase(undefined)).toEqual([])
  })
})

describe('uploading to the showcase', () => {
  it('turns every page of a PDF into a picture and keeps the original for download', async () => {
    const res = await upload(await pdfOf(3), 'brochure.pdf', 'Our treatments')
    expect(res.status).toBe(201)
    const [item] = await items()
    expect(item).toMatchObject({ kind: 'pdf', title: 'Our treatments' })
    expect(item.pages).toHaveLength(3)
    expect(item.url).toMatch(/file\.pdf$/)
    for (const p of item.pages) {
      const file = h.files.get(p.replace('https://files.example/', ''))!
      const meta = await sharp(file).metadata()
      expect(meta.format).toBe('jpeg'); expect(meta.width).toBe(1400)
    }
    expect(h.files.get(item.url.replace('https://files.example/', ''))!.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('stores a picture as a tidy JPEG, titled from the file name when no title is given', async () => {
    expect((await upload(await png(), 'front_desk.png')).status).toBe(201)
    const [item] = await items()
    expect(item).toMatchObject({ kind: 'image', title: 'front desk' })
    expect((await sharp(h.files.get(item.url.replace('https://files.example/', ''))!).metadata()).format).toBe('jpeg')
  })

  it('refuses a PDF with too many pages, and leaves nothing behind', async () => {
    const res = await upload(await pdfOf(MAX_SHOWCASE_PDF_PAGES + 1), 'big.pdf')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/pages/)
    expect(await items()).toHaveLength(0); expect(h.files.size).toBe(0)
  })

  it('refuses a damaged PDF, a renamed program or an SVG, and a file over 10 MB', async () => {
    expect((await upload(Buffer.from('%PDF-1.4 this is not really a pdf'), 'bad.pdf')).status).toBe(400)
    expect((await upload(Buffer.from('MZ\x90\x00 program'), 'brochure.pdf')).status).toBe(400)
    expect((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.svg')).status).toBe(400)
    expect((await upload(Buffer.concat([await png(), Buffer.alloc(10 * 1024 * 1024)]), 'huge.png')).status).toBe(400)
    expect(await items()).toHaveLength(0); expect(h.files.size).toBe(0)
  })

  it(`refuses the ${MAX_SHOWCASE_ITEMS + 1}th item`, async () => {
    const one = await png()
    for (let i = 0; i < MAX_SHOWCASE_ITEMS; i++) expect((await upload(one, `p${i}.png`)).status).toBe(201)
    const res = await upload(one, 'one-more.png')
    expect(res.status).toBe(400); expect((await res.json()).error).toMatch(/up to 12/)
    expect(await items()).toHaveLength(MAX_SHOWCASE_ITEMS)
  })

  it('needs a file', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: new FormData() }))
    expect(res!.status).toBe(400)
  })
})

describe('managing the showcase', () => {
  const patch = async (body: unknown) => (await PATCH(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })))!
  const add = async (n: string) => { await upload(await png(), `${n}.png`, n); const l = await items(); return l[l.length - 1].id as string }

  it('reorders, and leaves unlisted items after the listed ones', async () => {
    const a = await add('A'), b = await add('B'), c = await add('C')
    expect((await patch({ order: [c, a] })).status).toBe(200)
    expect((await items()).map((i: any) => i.id)).toEqual([c, a, b])
  })

  it('renames', async () => {
    const a = await add('A')
    expect((await patch({ rename: { id: a, title: '  New   name ' } })).status).toBe(200)
    expect((await items())[0].title).toBe('New name')
    expect((await patch({ rename: { id: 'nope', title: 'x' } })).status).toBe(404)
    expect((await patch({})).status).toBe(400)
  })

  it('removes an item and deletes all its files', async () => {
    await upload(await pdfOf(2), 'a.pdf', 'A')
    const [item] = await items()
    expect(h.files.size).toBe(3)
    const res = (await DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: item.id }) }))!
    expect(res.status).toBe(200)
    expect(await items()).toHaveLength(0); expect(h.files.size).toBe(0)
    expect((await DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: item.id }) }))!.status).toBe(404)
  })

  it('lists the items for Settings', async () => {
    await add('A')
    expect((await (await GET())!.json()).items).toHaveLength(1)
  })
})

describe('who can change the showcase', () => {
  it('front desk staff and signed-out visitors cannot', async () => {
    h.session = { uid: 'u2', role: 'STAFF' }
    expect((await upload(await png(), 'a.png')).status).toBe(403)
    expect((await GET())!.status).toBe(403)
    h.session = null
    expect((await upload(await png(), 'a.png')).status).toBe(401)
    expect(await items()).toHaveLength(0)
  })
})
