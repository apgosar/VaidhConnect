'use client'

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCw } from 'lucide-react'
import { Modal } from './Modal'

/**
 * Position a picture inside a square before it is uploaded: drag to move, slide or tap +/- to zoom, turn it.
 * `fit` = the whole picture shows at first (a logo, which must not be cut); `fill` = the square is covered (a face).
 * What is applied is a 512px square: a PNG for a logo (keeps transparency), a JPEG for a photo.
 */
type Mode = 'fit' | 'fill'
interface View { zoom: number; x: number; y: number; turns: number }

const OUTPUT = 512
const PREVIEW = 280
const MAX_ZOOM = 4

/** Draws the picture into a square canvas of `size` px. Offsets are fractions of the square so preview and output match. */
export function drawAdjusted(ctx: CanvasRenderingContext2D, size: number, img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, v: View, mode: Mode, background?: string) {
  ctx.clearRect(0, 0, size, size)
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, size, size) }
  const sideways = v.turns % 2 === 1
  const iw = sideways ? img.naturalHeight : img.naturalWidth
  const ih = sideways ? img.naturalWidth : img.naturalHeight
  const base = mode === 'fill' ? Math.max(size / iw, size / ih) : Math.min(size / iw, size / ih)
  const scale = base * v.zoom
  ctx.save()
  ctx.translate(size / 2 + v.x * size, size / 2 + v.y * size)
  ctx.rotate((v.turns * Math.PI) / 2)
  ctx.scale(scale, scale)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  ctx.restore()
}

export function ImageAdjustDialog({ src, title, mode, round, onCancel, onApply }: {
  /** Where the picture comes from: an object URL of the chosen file, or a same-origin URL. null = closed. */
  src: string | null
  title: string
  mode: Mode
  /** Shows a circular guide (the photo is shown round). */
  round?: boolean
  onCancel: () => void
  onApply: (file: File) => void
}) {
  const initial: View = { zoom: 1, x: 0, y: 0, turns: 0 }
  const [view, setView] = useState<View>(initial)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const minZoom = mode === 'fit' ? 0.4 : 1

  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0, turns: 0 }); setImg(null); setFailed(false)
    if (!src) return
    const el = new Image()
    el.onload = () => setImg(el)
    el.onerror = () => setFailed(true)
    el.src = src
  }, [src])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx && img) drawAdjusted(ctx, PREVIEW * 2, img, view, mode, '#ffffff')
  }, [img, view, mode])

  if (!src) return null

  const zoomTo = (z: number) => setView(v => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(minZoom, z)) }))

  const apply = () => {
    if (!img) return
    const out = document.createElement('canvas'); out.width = out.height = OUTPUT
    const ctx = out.getContext('2d'); if (!ctx) return
    const logo = mode === 'fit'
    drawAdjusted(ctx, OUTPUT, img, view, mode, logo ? undefined : '#ffffff')
    const type = logo ? 'image/png' : 'image/jpeg'
    out.toBlob(blob => { if (blob) onApply(new File([blob], logo ? 'logo.png' : 'photo.jpg', { type })) }, type, 0.9)
  }

  return (
    <Modal open title={title} onClose={onCancel}>
      {failed ? (
        <p className="text-sm text-red-700">This picture could not be opened. Please choose it again.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">Drag the picture to move it. Zoom or turn it until it looks right.</p>
          <div className="relative mx-auto touch-none select-none overflow-hidden rounded-xl border border-slate-200" style={{ width: PREVIEW, height: PREVIEW, maxWidth: '100%', background: 'repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 20px 20px' }}>
            <canvas
              ref={canvas} width={PREVIEW * 2} height={PREVIEW * 2} data-testid="adjust-canvas" className="block h-full w-full cursor-grab"
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY } }}
              onPointerMove={e => {
                if (!drag.current) return
                const box = e.currentTarget.getBoundingClientRect()
                const dx = (e.clientX - drag.current.x) / box.width, dy = (e.clientY - drag.current.y) / box.height
                drag.current = { x: e.clientX, y: e.clientY }
                setView(v => ({ ...v, x: Math.max(-1, Math.min(1, v.x + dx)), y: Math.max(-1, Math.min(1, v.y + dy)) }))
              }}
              onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
            />
            {round && <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 999px rgba(255,255,255,0.65)', border: '2px solid rgba(15,61,46,0.6)' }} />}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Zoom out" onClick={() => zoomTo(view.zoom - 0.2)}><Minus size={16} aria-hidden="true" /></button>
            <input type="range" aria-label="Zoom" className="min-w-0 flex-1" min={minZoom} max={MAX_ZOOM} step={0.05} value={view.zoom} onChange={e => zoomTo(Number(e.target.value))} />
            <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Zoom in" onClick={() => zoomTo(view.zoom + 0.2)}><Plus size={16} aria-hidden="true" /></button>
            <button type="button" className="btn btn-outline" style={{ width: 44, height: 44, padding: 0 }} aria-label="Turn the picture" onClick={() => setView(v => ({ ...v, turns: (v.turns + 1) % 4 }))}><RotateCw size={16} aria-hidden="true" /></button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView(initial)}>Start again</button>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={apply} disabled={!img || failed}>Use this</button>
      </div>
    </Modal>
  )
}
