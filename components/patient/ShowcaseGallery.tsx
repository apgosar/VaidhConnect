'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Minus, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { showcaseSizeText, type PublicShowcaseItem } from '@/lib/showcase'

const ZOOMS = [1, 1.5, 2, 3]

const slidesOf = (item: PublicShowcaseItem) => (item.kind === 'pdf' ? item.pages ?? [] : [item.url])

/** One PDF or picture as a swipeable gallery: the pages sit side by side and snap into place. */
function Pages({ item, onOpen }: { item: PublicShowcaseItem; onOpen: (page: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const pics = slidesOf(item)
  const go = (n: number) => {
    const next = Math.min(pics.length - 1, Math.max(0, n))
    setPage(next)
    const el = track.current
    el?.scrollTo?.({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="space-y-2">
      <div
        ref={track} role="group" aria-roledescription="carousel" aria-label={item.title}
        className="flex snap-x snap-mandatory items-start overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ border: '1px solid var(--color-sage-border)' }}
        onScroll={e => { const el = e.currentTarget; if (el.clientWidth) setPage(Math.round(el.scrollLeft / el.clientWidth)) }}
      >
        {pics.map((src, i) => (
          <button
            key={src} type="button" onClick={() => onOpen(i)}
            className="block w-full shrink-0 snap-center bg-white p-0"
            aria-label={`${item.title}${pics.length > 1 ? `, page ${i + 1} of ${pics.length}` : ''}. Tap to look closer`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="block h-auto w-full select-none" loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
          </button>
        ))}
      </div>
      {pics.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Previous page" onClick={() => go(page - 1)} disabled={page === 0}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span className="min-w-[6rem] text-center text-sm font-medium font-tabular" aria-live="polite">Page {page + 1} of {pics.length}</span>
          <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Next page" onClick={() => go(page + 1)} disabled={page >= pics.length - 1}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      )}
    </div>
  )
}

/**
 * The clinic's published PDFs and pictures. Each is a gallery in the page: swipe sideways (or use the arrows) to
 * move through the pages, tap a page to look closer with zoom, or download the original PDF.
 */
export function ShowcaseGallery({ items }: { items: PublicShowcaseItem[] }) {
  const [open, setOpen] = useState<{ item: PublicShowcaseItem; page: number } | null>(null)
  const [zoom, setZoom] = useState(0)
  const [swipeFrom, setSwipeFrom] = useState<number | null>(null)

  if (items.length === 0) return null
  const slides = open ? slidesOf(open.item) : []
  const go = (n: number) => setOpen(o => (o ? { ...o, page: Math.min(slides.length - 1, Math.max(0, o.page + n)) } : o))

  return (
    <div id="services" className="space-y-6 relative z-10 pt-2 scroll-mt-20">
      <h2 className="text-xl font-bold px-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Our Services</h2>
      {items.map(item => (
        <section key={item.id} aria-label={item.title} className="space-y-3">
          <h3 className="px-1 text-base font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--color-charcoal)' }}>{item.title}</h3>
          <Pages item={item} onOpen={page => { setOpen({ item, page }); setZoom(0) }} />
          {item.kind === 'pdf' && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline w-full">
              <Download size={16} aria-hidden="true" /> Download PDF ({showcaseSizeText(item.bytes)})
            </a>
          )}
        </section>
      ))}

      <Modal open={!!open} title={open?.item.title ?? ''} size="lg" onClose={() => setOpen(null)}>
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
              <img src={slides[open.page]} alt={`${open.item.title}${slides.length > 1 ? `, page ${open.page + 1} of ${slides.length}` : ''}`} className="block h-auto max-w-none select-none" style={{ width: `${ZOOMS[zoom] * 100}%` }} draggable={false} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Previous page" onClick={() => go(-1)} disabled={open.page === 0}><ChevronLeft size={18} aria-hidden="true" /></button>
                <span className="min-w-[5.5rem] text-center text-sm font-medium font-tabular" aria-live="polite">{slides.length > 1 ? `Page ${open.page + 1} of ${slides.length}` : 'Picture'}</span>
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Next page" onClick={() => go(1)} disabled={open.page >= slides.length - 1}><ChevronRight size={18} aria-hidden="true" /></button>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={zoom === 0}><Minus size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Zoom in" onClick={() => setZoom(z => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1}><Plus size={16} aria-hidden="true" /></button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
