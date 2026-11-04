'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText, Minus, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { showcaseCover, showcaseSizeText, type PublicShowcaseItem } from '@/lib/showcase'

const ZOOMS = [1, 1.5, 2, 3]

/**
 * The clinic's published PDFs and pictures. A PDF was turned into page pictures when it was uploaded, so it is read
 * here, page by page, the same way as a picture: swipe or use the arrows, zoom with + and -, or download the original.
 */
export function ShowcaseGallery({ items }: { items: PublicShowcaseItem[] }) {
  const [open, setOpen] = useState<PublicShowcaseItem | null>(null)
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(0)
  const [swipeFrom, setSwipeFrom] = useState<number | null>(null)

  if (items.length === 0) return null
  const slides = open ? (open.kind === 'pdf' ? open.pages ?? [] : [open.url]) : []
  const go = (n: number) => setPage(p => Math.min(slides.length - 1, Math.max(0, p + n)))
  const show = (item: PublicShowcaseItem) => { setOpen(item); setPage(0); setZoom(0) }

  return (
    <div id="services" className="space-y-3 relative z-10 pt-2 scroll-mt-20">
      <h2 className="text-xl font-bold px-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Our Services</h2>
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <button key={item.id} type="button" onClick={() => show(item)} className="card overflow-hidden text-left shadow-sm" style={{ border: '1px solid var(--color-sage-border)' }}>
            <div className="relative aspect-[3/4] w-full bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={showcaseCover(item)} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
              {item.kind === 'pdf' && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700">
                  <FileText size={12} aria-hidden="true" /> PDF
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--color-charcoal)' }}>{item.title}</p>
              <p className="text-xs" style={{ color: 'var(--color-sage)' }}>
                {item.kind === 'pdf' ? `${item.pages?.length ?? 0} ${item.pages?.length === 1 ? 'page' : 'pages'}` : 'Picture'}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={!!open} title={open?.title ?? ''} size="lg" onClose={() => setOpen(null)}>
        {open && (
          <div className="space-y-3">
            <div
              className="max-h-[65dvh] overflow-auto rounded-lg border border-slate-200 bg-slate-50"
              style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
              onPointerDown={e => setSwipeFrom(e.clientX)}
              onPointerUp={e => {
                if (swipeFrom !== null && zoom === 0 && Math.abs(e.clientX - swipeFrom) > 60) go(e.clientX < swipeFrom ? 1 : -1)
                setSwipeFrom(null)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slides[page]} alt={`${open.title}${slides.length > 1 ? `, page ${page + 1} of ${slides.length}` : ''}`} className="block h-auto max-w-none select-none" style={{ width: `${ZOOMS[zoom] * 100}%` }} draggable={false} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Previous page" onClick={() => go(-1)} disabled={page === 0}><ChevronLeft size={18} aria-hidden="true" /></button>
                <span className="min-w-[5.5rem] text-center text-sm font-medium font-tabular" aria-live="polite">{slides.length > 1 ? `Page ${page + 1} of ${slides.length}` : 'Picture'}</span>
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Next page" onClick={() => go(1)} disabled={page >= slides.length - 1}><ChevronRight size={18} aria-hidden="true" /></button>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={zoom === 0}><Minus size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Zoom in" onClick={() => setZoom(z => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1}><Plus size={16} aria-hidden="true" /></button>
              </div>
            </div>

            {open.kind === 'pdf' && (
              <a href={open.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline w-full">
                <Download size={16} aria-hidden="true" /> Download PDF ({showcaseSizeText(open.bytes)})
              </a>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
