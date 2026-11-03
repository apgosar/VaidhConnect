'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { readFailure, networkFailureText } from '@/lib/clientErrors'

interface Scan { id: string; url: string; uploadedAt: string }

const MAX_SIDE = 2200

/** Phone photos are 5-12 MB. Shrinking them first makes the upload quick on a mobile connection; the server does the final pass. */
async function shrink(file: File): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return blob && blob.size < file.size ? new File([blob], 'prescription.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file // the browser could not read it here; the server will say if it is not a photo
  }
}

/**
 * Keep a photo of a handwritten prescription with the visit. "Take photo" opens the phone's camera;
 * "Choose from gallery" opens the photo library (several at once). Photos stay private to the clinic.
 */
export function HandwrittenRx({ appointmentId }: { appointmentId: string }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { confirm, dialog } = useConfirm()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/rx-scans`)
      if (res.ok) setScans((await res.json()).scans ?? [])
    } catch { /* the list is a convenience; adding a photo still works */ }
  }, [appointmentId])
  useEffect(() => { load() }, [load])

  const upload = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (files.length === 0) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      for (const f of await Promise.all(files.map(shrink))) fd.append('photo', f)
      const res = await fetch(`/api/appointments/${appointmentId}/rx-scans`, { method: 'POST', body: fd })
      if (!res.ok) { setError(await readFailure(res, 'Could not add the photo.')); await load(); return }
      setScans((await res.json()).scans ?? [])
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
  }

  const remove = async (scan: Scan) => {
    if (!(await confirm({ title: 'Remove this photo?', message: 'It will be deleted from this visit.', confirmLabel: 'Remove', danger: true }))) return
    setError('')
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/rx-scans/${scan.id}`, { method: 'DELETE' })
      if (!res.ok) { setError(await readFailure(res, 'Could not remove the photo.')); return }
      setScans(prev => prev.filter(s => s.id !== scan.id))
    } catch {
      setError(networkFailureText())
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-slate-300 p-4 space-y-3" aria-labelledby="hw-rx-title">
      <div>
        <h4 id="hw-rx-title" className="font-semibold text-slate-800">Handwritten prescription</h4>
        <p className="text-xs text-slate-600 mt-0.5">Wrote it on paper? Add a photo to keep it with this visit. It is for your records and is not sent to the patient.</p>
      </div>

      {/* capture="environment" opens the rear camera on a phone; on a computer it is an ordinary file picker */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo of the prescription" onChange={e => upload(e.target.files)} />
      <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Choose prescription photos from the gallery" onChange={e => upload(e.target.files)} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => camera.current?.click()}>
          <Camera size={16} aria-hidden="true" /> Take photo
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => gallery.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" /> From gallery
        </button>
      </div>

      {busy && <p role="status" className="text-sm text-slate-600">Adding the photo...</p>}
      {error && <Alert variant="error">{error}</Alert>}

      {scans.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {scans.map((s, i) => (
            <li key={s.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <a href={s.url} target="_blank" rel="noopener" aria-label={`Open handwritten prescription page ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link; next/image would cache and proxy it */}
                <img src={s.url} alt={`Handwritten prescription, page ${i + 1}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
              </a>
              <button type="button" onClick={() => remove(s)} aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 flex items-center justify-center rounded-full bg-white/90 text-red-600 shadow" style={{ width: 36, height: 36 }}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  )
}
