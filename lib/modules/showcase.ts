import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { tenantDb } from '@/lib/db/tenant'
import { deleteFile, tenantPath, uploadFile } from '@/lib/storage'
import type { Tenant } from '@/lib/tenant/types'
import {
  MAX_SHOWCASE_BYTES, MAX_SHOWCASE_ITEMS, MAX_SHOWCASE_PDF_PAGES, cleanShowcaseTitle, sniffShowcaseKind, type ShowcaseItem,
} from '@/lib/showcase'

export class ShowcaseError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const PAGE_WIDTH = 1400
const IMAGE_SIDE = 1600
const limitMessage = `The showcase can hold up to ${MAX_SHOWCASE_ITEMS} items. Remove one to add another.`

/**
 * Draws every page of a PDF as a JPEG about 1400px wide. Done with mupdf (WebAssembly, no native libraries).
 * Refuses a file that cannot be read, is password-protected, is empty or has more than the allowed pages.
 */
export async function renderPdfPages(pdf: Buffer): Promise<Buffer[]> {
  const mupdf = await import('mupdf')
  let doc: ReturnType<typeof mupdf.Document.openDocument>
  try {
    doc = mupdf.Document.openDocument(pdf, 'application/pdf')
  } catch {
    throw new ShowcaseError(400, 'That PDF could not be read. Please check the file and try again.')
  }
  try {
    if (doc.needsPassword()) throw new ShowcaseError(400, 'That PDF is password-protected. Please upload one without a password.')
    const count = doc.countPages()
    if (count < 1) throw new ShowcaseError(400, 'That PDF has no pages.')
    if (count > MAX_SHOWCASE_PDF_PAGES) throw new ShowcaseError(400, `That PDF has ${count} pages. Up to ${MAX_SHOWCASE_PDF_PAGES} pages are allowed.`)
    const out: Buffer[] = []
    for (let i = 0; i < count; i++) {
      const page = doc.loadPage(i)
      try {
        const [x0, , x1] = page.getBounds()
        const scale = PAGE_WIDTH / Math.max(1, x1 - x0)
        const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
        try {
          out.push(await sharp(Buffer.from(pix.asPNG())).jpeg({ quality: 82 }).toBuffer())
        } finally { pix.destroy() }
      } finally { page.destroy() }
    }
    return out
  } catch (e) {
    if (e instanceof ShowcaseError) throw e
    throw new ShowcaseError(400, 'That PDF could not be read. Please check the file and try again.')
  } finally {
    doc.destroy()
  }
}

/** Adds a PDF (turned into page pictures) or a picture to the clinic's showcase. */
export async function addShowcaseItem(tenant: Tenant, file: { size: number; data: Buffer; name: string }, title: unknown): Promise<ShowcaseItem> {
  const ref = tenantDb(tenant).profile()
  if (file.size > MAX_SHOWCASE_BYTES || file.data.length > MAX_SHOWCASE_BYTES) throw new ShowcaseError(400, 'That file is too large. Please use one under 10 MB.')
  const kind = sniffShowcaseKind(file.data)
  if (!kind) throw new ShowcaseError(400, 'Only PDF files and pictures (JPG, PNG or WebP) can be added.')
  const snap = await ref.get()
  if (!snap.exists) throw new ShowcaseError(404, 'Clinic profile not found')
  if (((snap.data()?.showcase ?? []) as ShowcaseItem[]).length >= MAX_SHOWCASE_ITEMS) throw new ShowcaseError(400, limitMessage)

  const id = randomUUID()
  const base = `showcase/${id}`
  const uploaded: string[] = []
  const put = async (data: Buffer, name: string, type: string) => {
    const url = await uploadFile(data, tenantPath(tenant, `${base}/${name}`), type, { public: true })
    uploaded.push(url)
    return url
  }

  let item: ShowcaseItem
  try {
    if (kind === 'image') {
      let jpeg: Buffer
      try {
        jpeg = await sharp(file.data).rotate().flatten({ background: '#ffffff' })
          .resize({ width: IMAGE_SIDE, height: IMAGE_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
      } catch {
        throw new ShowcaseError(400, 'That file is not a valid picture.')
      }
      const url = await put(jpeg, 'image.jpg', 'image/jpeg')
      item = { id, kind, title: cleanShowcaseTitle(title, file.name), url, bytes: jpeg.length, createdAt: new Date().toISOString() }
    } else {
      const pages = await renderPdfPages(file.data)
      const url = await put(file.data, 'file.pdf', 'application/pdf')
      const pageUrls: string[] = []
      for (let i = 0; i < pages.length; i++) pageUrls.push(await put(pages[i], `p${i + 1}.jpg`, 'image/jpeg'))
      item = { id, kind, title: cleanShowcaseTitle(title, file.name), url, pages: pageUrls, bytes: file.data.length, createdAt: new Date().toISOString() }
    }
    // Checked again inside the transaction, so two uploads at the same moment cannot pass the limit together.
    await ref.firestore.runTransaction(async tx => {
      const current = await tx.get(ref)
      const items = (current.data()?.showcase ?? []) as ShowcaseItem[]
      if (items.length >= MAX_SHOWCASE_ITEMS) throw new ShowcaseError(400, limitMessage)
      tx.update(ref, { showcase: [...items, item], updatedAt: new Date() })
    })
  } catch (e) {
    await Promise.all(uploaded.map(u => deleteFile(u)))
    throw e
  }
  return item
}

export async function listShowcase(tenant: Tenant): Promise<ShowcaseItem[]> {
  const snap = await tenantDb(tenant).profile().get()
  return (snap.data()?.showcase ?? []) as ShowcaseItem[]
}

/** Renames and/or reorders. `order` lists ids; anything it leaves out stays, after the listed ones. */
export async function updateShowcase(tenant: Tenant, change: { order?: string[]; rename?: { id: string; title: string } }): Promise<ShowcaseItem[]> {
  const ref = tenantDb(tenant).profile()
  return ref.firestore.runTransaction(async tx => {
    const current = await tx.get(ref)
    let items = (current.data()?.showcase ?? []) as ShowcaseItem[]
    if (change.rename) {
      if (!items.some(i => i.id === change.rename!.id)) throw new ShowcaseError(404, 'Item not found')
      items = items.map(i => (i.id === change.rename!.id ? { ...i, title: cleanShowcaseTitle(change.rename!.title, i.title) } : i))
    }
    if (change.order) {
      const rank = new Map(change.order.map((id, n) => [id, n]))
      items = items.map((i, n) => ({ i, n })).sort((a, b) => (rank.get(a.i.id) ?? 1e6 + a.n) - (rank.get(b.i.id) ?? 1e6 + b.n)).map(x => x.i)
    }
    tx.update(ref, { showcase: items, updatedAt: new Date() })
    return items
  })
}

export async function removeShowcaseItem(tenant: Tenant, id: string): Promise<void> {
  const ref = tenantDb(tenant).profile()
  const target = (await listShowcase(tenant)).find(i => i.id === id)
  if (!target) throw new ShowcaseError(404, 'Item not found')
  await ref.firestore.runTransaction(async tx => {
    const current = await tx.get(ref)
    tx.update(ref, { showcase: ((current.data()?.showcase ?? []) as ShowcaseItem[]).filter(i => i.id !== id), updatedAt: new Date() })
  })
  await Promise.all([target.url, ...(target.pages ?? [])].map(u => deleteFile(u)))
}
