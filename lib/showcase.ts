/** The clinic showcase: PDFs and pictures the clinic publishes on its public page ("Our services"). */
export const MAX_SHOWCASE_ITEMS = 12
export const MAX_SHOWCASE_BYTES = 10 * 1024 * 1024
export const MAX_SHOWCASE_PDF_PAGES = 20
export const MAX_SHOWCASE_TITLE = 80

export type ShowcaseKind = 'pdf' | 'image'

/** What is stored on the clinic profile. Files are public, like the logo and product photos. */
export interface ShowcaseItem {
  id: string
  kind: ShowcaseKind
  title: string
  /** The picture itself, or the original PDF (for Download). */
  url: string
  /** PDFs only: one image per page, in order. */
  pages?: string[]
  bytes: number
  createdAt: string
}

export type PublicShowcaseItem = Pick<ShowcaseItem, 'id' | 'kind' | 'title' | 'url' | 'pages' | 'bytes'>

export const toPublicShowcase = (items: unknown): PublicShowcaseItem[] =>
  (Array.isArray(items) ? (items as ShowcaseItem[]) : []).map(({ id, kind, title, url, pages, bytes }) => ({ id, kind, title, url, pages, bytes }))

/** The thumbnail of a card: a PDF's first page, or the picture. */
export const showcaseCover = (item: PublicShowcaseItem): string => (item.kind === 'pdf' ? item.pages?.[0] ?? item.url : item.url)

/** A tidy title: whitespace collapsed, limited in length; falls back to the file name without its extension. */
export function cleanShowcaseTitle(raw: unknown, fileName = ''): string {
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_SHOWCASE_TITLE)
  const given = typeof raw === 'string' ? tidy(raw) : ''
  if (given) return given
  return tidy(fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')) || 'Untitled'
}

/** What the bytes really are. The type the browser sent proves nothing, and SVG is never accepted (it can carry script). */
export function sniffShowcaseKind(b: Buffer): ShowcaseKind | null {
  if (b.subarray(0, 1024).includes(Buffer.from('%PDF-'))) return 'pdf'
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const png = b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const webp = b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'
  return jpeg || png || webp ? 'image' : null
}

export const showcaseSizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
