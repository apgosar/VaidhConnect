/**
 * Where a letterhead's printed header and footer end, found from the picture itself, so the prescription can use
 * the empty space between them. A letterhead is assumed to have a header at the top and a footer at the bottom.
 */
export const PAGE_HEIGHT_MM = 297
const INK_BELOW = 225 // a grey value darker than this counts as printed
const INK_SHARE = 0.02 // a row with at least this share of printed pixels is part of the artwork
const SAME_BLOCK_MM = 12 // gaps smaller than this belong to the same block (a logo above its address lines)
const BREATHING_MM = 5 // clear space kept between the artwork and the text

export interface Zones {
  /** Where the header's artwork ends, in mm from the top of the page; null when there is no header. */
  headerEndMm: number | null
  /** Where the footer's artwork starts, in mm from the top of the page; null when there is no footer. */
  footerStartMm: number | null
}

/** `gray` is one byte per pixel, rows from the top (0 = black, 255 = white). */
export function detectZones(gray: Uint8Array, width: number, height: number): Zones {
  const none: Zones = { headerEndMm: null, footerStartMm: null }
  if (!width || !height) return none
  const mmPerRow = PAGE_HEIGHT_MM / height
  const ink: boolean[] = []
  for (let y = 0; y < height; y++) {
    let n = 0
    for (let x = 0; x < width; x++) if (gray[y * width + x] < INK_BELOW) n++
    ink.push(n / width >= INK_SHARE)
  }
  const first = ink.indexOf(true)
  const last = ink.lastIndexOf(true)
  if (first < 0) return none
  const allowedGap = Math.max(1, Math.round(SAME_BLOCK_MM / mmPerRow))

  let headerEnd = first
  for (let y = first, gap = 0; y < height; y++) {
    if (ink[y]) { headerEnd = y; gap = 0 } else if (++gap > allowedGap) break
  }
  let footerStart = last
  for (let y = last, gap = 0; y >= 0; y--) {
    if (ink[y]) { footerStart = y; gap = 0 } else if (++gap > allowedGap) break
  }

  const header = (headerEnd + 1) * mmPerRow
  const footer = footerStart * mmPerRow
  if (footerStart <= headerEnd) {
    // One block only. A block covering most of the page (a watermark, a border) tells us nothing; otherwise it is a header or a footer.
    if (footer < PAGE_HEIGHT_MM * 0.2 && header > PAGE_HEIGHT_MM * 0.75) return none
    return header <= PAGE_HEIGHT_MM / 2 ? { headerEndMm: header, footerStartMm: null } : { headerEndMm: null, footerStartMm: footer }
  }
  return { headerEndMm: header, footerStartMm: footer }
}

/** Top and bottom spacing (mm) that keeps text between the header and the footer. */
export function spacingFromZones(z: Zones): { top: number; bottom: number } {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.ceil(v)))
  return {
    top: z.headerEndMm === null ? 15 : clamp(z.headerEndMm + BREATHING_MM, 120),
    bottom: z.footerStartMm === null ? 15 : clamp(PAGE_HEIGHT_MM - z.footerStartMm + BREATHING_MM, 100),
  }
}
