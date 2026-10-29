import type { PdfImage } from './common'

/** Spacing, in millimetres, left free for a letterhead's printed artwork. */
export interface PrintMargins { top: number; bottom: number; left: number; right: number }

export const DEFAULT_MARGINS: PrintMargins = { top: 45, bottom: 25, left: 15, right: 15 }

export const MARGIN_LIMITS: Record<keyof PrintMargins, [number, number]> = {
  top: [0, 120], bottom: [0, 100], left: [0, 60], right: [0, 60],
}

export const mmToPt = (mm: number) => (mm * 72) / 25.4

/** Strict: undefined when anything is missing, not a number or out of range. Used when saving settings. */
export function parseMargins(raw: unknown): PrintMargins | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Partial<PrintMargins> = {}
  for (const key of Object.keys(MARGIN_LIMITS) as (keyof PrintMargins)[]) {
    const n = Number((raw as Record<string, unknown>)[key])
    const [min, max] = MARGIN_LIMITS[key]
    if (!Number.isFinite(n) || n < min || n > max) return undefined
    out[key] = Math.round(n * 2) / 2 // half-millimetre steps
  }
  return out as PrintMargins
}

/** Lenient: whatever is stored, mended to something printable. Used when rendering. */
export function marginsOrDefault(raw: unknown): PrintMargins {
  return parseMargins(raw) ?? DEFAULT_MARGINS
}

/**
 *  standard   - the digital look: the clinic's uploaded letterhead behind the content, or our own header.
 *  preprinted - for paper that already carries the letterhead: content only, spaced to clear the printed artwork.
 */
export type PrintMode = 'standard' | 'preprinted'

export const parsePrintMode = (v: string | null | undefined): PrintMode => (v === 'preprinted' ? 'preprinted' : 'standard')

export interface PdfLayout {
  mode: PrintMode
  margins: PrintMargins
  /** A4 page image drawn behind every page (standard mode only). */
  letterhead?: PdfImage
}

export const STANDARD_LAYOUT: PdfLayout = { mode: 'standard', margins: DEFAULT_MARGINS }

/** A4 portrait is 210 x 297 mm; uploads must be within this much of that shape. */
export const A4_RATIO = 210 / 297
export const A4_RATIO_TOLERANCE = 0.08
