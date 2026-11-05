import { describe, it, expect } from 'vitest'
import React from 'react'
import sharp from 'sharp'
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { detectZones, spacingFromZones } from '@/lib/letterheadZones'
import { prepareLetterhead } from '@/lib/modules/letterhead'

/** An A4-shaped greyscale page, white, with black bands at the given mm ranges (full width). */
function page(bands: [number, number][], width = 420, height = 594) {
  const g = new Uint8Array(width * height).fill(255)
  for (const [a, b] of bands) for (let y = Math.floor((a / 297) * height); y < Math.ceil((b / 297) * height); y++) g.fill(0, y * width + 40, y * width + width - 40)
  return { g, width, height }
}

describe('finding the header and footer of a letterhead', () => {
  it('measures where a header ends and a footer starts', () => {
    const { g, width, height } = page([[10, 30], [34, 40], [48, 49], [280, 288]])
    const z = detectZones(g, width, height)
    expect(z.headerEndMm).toBeGreaterThan(48); expect(z.headerEndMm).toBeLessThan(51)
    expect(z.footerStartMm).toBeGreaterThan(279); expect(z.footerStartMm).toBeLessThan(281)
  })
  it('treats the logo and the address lines under it as one header, not as the page content', () => {
    const { g, width, height } = page([[8, 35], [41, 47], [52, 56]])
    expect(detectZones(g, width, height).headerEndMm).toBeGreaterThan(55)
  })
  it('counts a signature block close above the footer quote as part of the footer', () => {
    const { g, width, height } = page([[8, 50], [232, 250], [256, 262], [270, 284]])
    expect(detectZones(g, width, height).footerStartMm).toBeLessThan(233)
  })
  it('copes with a header only, a footer only, a blank page and a page that is all artwork', () => {
    const h = page([[10, 40]]); expect(detectZones(h.g, h.width, h.height)).toMatchObject({ footerStartMm: null })
    const f = page([[270, 290]]); expect(detectZones(f.g, f.width, f.height)).toMatchObject({ headerEndMm: null })
    const b = page([]); expect(detectZones(b.g, b.width, b.height)).toEqual({ headerEndMm: null, footerStartMm: null })
    const w = page([[0, 297]]); expect(detectZones(w.g, w.width, w.height)).toEqual({ headerEndMm: null, footerStartMm: null })
  })
  it('leaves breathing room, and sensible defaults when a part is missing', () => {
    expect(spacingFromZones({ headerEndMm: 50, footerStartMm: 280 })).toEqual({ top: 55, bottom: 22 })
    expect(spacingFromZones({ headerEndMm: null, footerStartMm: null })).toEqual({ top: 15, bottom: 15 })
  })
})

const bandPng = async (bands: [number, number][]) => {
  const { g, width, height } = page(bands, 840, 1188)
  return sharp(Buffer.from(g), { raw: { width, height, channels: 1 } }).png().toBuffer()
}

describe('reading an uploaded letterhead', () => {
  it('takes a picture and works out the spacing', async () => {
    const out = await prepareLetterhead(await bandPng([[10, 49], [279, 288]]))
    expect(out.ext).toBe('png')
    expect(out.spacing.top).toBeGreaterThanOrEqual(52); expect(out.spacing.top).toBeLessThanOrEqual(57)
    expect(out.spacing.bottom).toBeGreaterThanOrEqual(22); expect(out.spacing.bottom).toBeLessThanOrEqual(27)
  })
  it('takes a PDF, using its first page', async () => {
    const pdf = await renderToBuffer(
      <Document><Page size="A4"><View style={{ height: 120, backgroundColor: '#000' }} /><Text>x</Text></Page><Page size="A4"><Text>second</Text></Page></Document>,
    )
    const out = await prepareLetterhead(pdf)
    expect(out.contentType).toBe('image/png')
    expect(out.zones.headerEndMm).toBeGreaterThan(38) // 120pt is about 42 mm
    expect(out.spacing.top).toBeGreaterThan(40)
  })
  it('refuses a page that is not A4 shaped, a file that is neither a picture nor a PDF, and a Word file', async () => {
    const wide = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#fff' } }).png().toBuffer()
    await expect(prepareLetterhead(wide)).rejects.toThrow(/A4/)
    await expect(prepareLetterhead(Buffer.from('PK\u0003\u0004 not an image'))).rejects.toThrow(/PDF, or a JPG or PNG/)
    await expect(prepareLetterhead(Buffer.from('MZ program'))).rejects.toThrow(/PDF, or a JPG or PNG/)
  })
})
