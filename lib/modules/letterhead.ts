import sharp, { type Sharp, type Metadata } from 'sharp'
import { A4_RATIO, A4_RATIO_TOLERANCE } from '@/lib/pdf/layout'
import { detectZones, spacingFromZones, type Zones } from '@/lib/letterheadZones'

export class LetterheadError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const MAX_LETTERHEAD_BYTES = 5 * 1024 * 1024
const NOT_A4 = 'The letterhead should be a portrait A4 page (210 x 297 mm). Export or scan the whole page.'

const isPdf = (b: Buffer) => b.subarray(0, 1024).includes(Buffer.from('%PDF-'))
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
const isPng = (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))

/** The first page of a PDF as a PNG, about 200 dpi (1654 px wide). */
async function firstPdfPage(pdf: Buffer): Promise<Buffer> {
  const mupdf = await import('mupdf')
  let doc: ReturnType<typeof mupdf.Document.openDocument>
  try { doc = mupdf.Document.openDocument(pdf, 'application/pdf') } catch { throw new LetterheadError(400, 'That PDF could not be read. Please check the file and try again.') }
  try {
    if (doc.needsPassword()) throw new LetterheadError(400, 'That PDF is password-protected. Please upload one without a password.')
    if (doc.countPages() < 1) throw new LetterheadError(400, 'That PDF has no pages.')
    const page = doc.loadPage(0)
    try {
      const [x0, y0, x1, y1] = page.getBounds()
      const w = x1 - x0, h = y1 - y0
      if (!w || !h || Math.abs(w / h - A4_RATIO) > A4_RATIO_TOLERANCE) throw new LetterheadError(400, NOT_A4)
      const scale = 1654 / w
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
      try { return Buffer.from(pix.asPNG()) } finally { pix.destroy() }
    } finally { page.destroy() }
  } catch (e) {
    if (e instanceof LetterheadError) throw e
    throw new LetterheadError(400, 'That PDF could not be read. Please check the file and try again.')
  } finally { doc.destroy() }
}

export interface PreparedLetterhead {
  buffer: Buffer
  ext: 'png' | 'jpg'
  contentType: 'image/png' | 'image/jpeg'
  zones: Zones
  /** Top and bottom spacing, in mm, that keeps text between the header and the footer. */
  spacing: { top: number; bottom: number }
}

/**
 * Turns an uploaded letterhead (a PDF, or a JPG / PNG picture, of one whole A4 page) into the picture drawn behind
 * every prescription, and works out how much of the top and bottom the printed header and footer take up.
 * Checked by the file's own bytes, never by the type the browser claims.
 */
export async function prepareLetterhead(raw: Buffer): Promise<PreparedLetterhead> {
  if (raw.length > MAX_LETTERHEAD_BYTES) throw new LetterheadError(400, 'The letterhead must be under 5MB')
  let source: Buffer, png: boolean
  if (isPdf(raw)) { source = await firstPdfPage(raw); png = true }
  else if (isPng(raw)) { source = raw; png = true }
  else if (isJpeg(raw)) { source = raw; png = false }
  else throw new LetterheadError(400, 'The letterhead must be a PDF, or a JPG or PNG image, of a full A4 page')

  let image: Sharp, meta: Metadata
  try { image = sharp(source).rotate(); meta = await image.metadata() } catch { throw new LetterheadError(400, 'That file is not a valid image') }
  const sideways = (meta.orientation ?? 1) >= 5
  const width = (sideways ? meta.height : meta.width) ?? 0
  const height = (sideways ? meta.width : meta.height) ?? 0
  if (!width || !height || Math.abs(width / height - A4_RATIO) > A4_RATIO_TOLERANCE) throw new LetterheadError(400, NOT_A4)

  // A4 at 200 dpi is plenty for print and keeps every PDF small.
  const resized = image.resize({ width: 1654, height: 2339, fit: 'inside', withoutEnlargement: true })
  const buffer = await (png ? resized.png() : resized.jpeg({ quality: 88 })).toBuffer()

  const small = await sharp(buffer).flatten({ background: '#ffffff' }).greyscale().resize({ width: 420 }).raw().toBuffer({ resolveWithObject: true })
  const zones = detectZones(new Uint8Array(small.data), small.info.width, small.info.height)
  return { buffer, ext: png ? 'png' : 'jpg', contentType: png ? 'image/png' : 'image/jpeg', zones, spacing: spacingFromZones(zones) }
}
