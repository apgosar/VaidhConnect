'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FileText, Trash2, Upload } from 'lucide-react'
import { Section } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { readFailure, networkFailureText } from '@/lib/clientErrors'
import { MAX_SHOWCASE_ITEMS, MAX_SHOWCASE_BYTES, MAX_SHOWCASE_PDF_PAGES, showcaseCover, showcaseSizeText, type ShowcaseItem } from '@/lib/showcase'

/**
 * Settings → Our Services: PDFs and pictures shown on the public page. Each upload, rename, move and removal is saved
 * straight away; it does not wait for the Save button of the rest of Settings.
 */
export function ShowcaseSection() {
  const [items, setItems] = useState<ShowcaseItem[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    fetch('/api/doctor/showcase').then(async r => (r.ok ? setItems((await r.json()).items ?? []) : setError(await readFailure(r, 'Could not load your items.')))).catch(() => setError(networkFailureText()))
  }, [])

  const call = async (label: string, run: () => Promise<Response>, failure: string) => {
    setBusy(label); setError(''); setNotice('')
    try {
      const res = await run()
      if (!res.ok) { setError(await readFailure(res, failure)); return false }
      setItems((await res.json()).items ?? [])
      return true
    } catch {
      setError(networkFailureText()); return false
    } finally {
      setBusy(null)
    }
  }

  const upload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file); fd.append('title', title)
    const ok = await call('upload', () => fetch('/api/doctor/showcase', { method: 'POST', body: fd }), 'Could not add that file.')
    if (ok) { setTitle(''); setNotice('Added. It is now on your public page.') }
  }

  const move = (index: number, by: -1 | 1) => {
    if (!items) return
    const order = items.map(i => i.id); const [id] = order.splice(index, 1); order.splice(index + by, 0, id)
    call('move', () => fetch('/api/doctor/showcase', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) }), 'Could not move it.')
  }
  const rename = (item: ShowcaseItem, next: string) => {
    if (next.trim() === item.title) return
    call('rename', () => fetch('/api/doctor/showcase', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rename: { id: item.id, title: next } }) }), 'Could not rename it.')
  }
  const remove = async (item: ShowcaseItem) => {
    if (!(await confirm({ title: `Remove "${item.title}"?`, message: 'It disappears from your public page and its files are deleted.', confirmLabel: 'Remove', danger: true }))) return
    call('remove', () => fetch(`/api/doctor/showcase/${item.id}`, { method: 'DELETE' }), 'Could not remove it.')
  }

  const full = (items?.length ?? 0) >= MAX_SHOWCASE_ITEMS

  return (
    <Section title="Our Services (PDFs and pictures)" description={`Show a brochure or pictures of your services on your public page. A PDF is turned into pages patients can read right there (up to ${MAX_SHOWCASE_PDF_PAGES} pages). Up to ${MAX_SHOWCASE_ITEMS} items, each under ${MAX_SHOWCASE_BYTES / 1024 / 1024} MB.`}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}

        <div className="space-y-2">
          <label htmlFor="showcase-title" className="form-label">Title (optional)</label>
          <input id="showcase-title" className="form-input" placeholder="e.g. Our treatments" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} disabled={busy !== null} />
          <input
            ref={picker} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Choose a PDF or picture"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }}
          />
          <button type="button" className="btn btn-outline" onClick={() => picker.current?.click()} disabled={busy !== null || full}>
            <Upload size={16} aria-hidden="true" /> {busy === 'upload' ? 'Adding... a PDF takes a few seconds' : 'Add a PDF or picture'}
          </button>
          {full && <p className="text-xs text-slate-500">You have {MAX_SHOWCASE_ITEMS} items. Remove one to add another.</p>}
        </div>

        {items === null ? (
          !error && <p className="text-sm text-slate-500">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing added yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={showcaseCover(item)} alt="" className="h-16 w-12 shrink-0 rounded-md bg-slate-50 object-cover object-top" />
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Title of ${item.title}`} className="form-input" defaultValue={item.title} maxLength={80} disabled={busy !== null}
                    onBlur={e => rename(item, e.target.value)}
                  />
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    {item.kind === 'pdf' ? <><FileText size={12} aria-hidden="true" /> PDF, {item.pages?.length ?? 0} pages</> : 'Picture'} · {showcaseSizeText(item.bytes)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <button type="button" className="btn btn-ghost" style={{ width: 44, height: 44, padding: 0 }} aria-label={`Move ${item.title} up`} onClick={() => move(i, -1)} disabled={busy !== null || i === 0}><ArrowUp size={16} aria-hidden="true" /></button>
                  <button type="button" className="btn btn-ghost" style={{ width: 44, height: 44, padding: 0 }} aria-label={`Move ${item.title} down`} onClick={() => move(i, 1)} disabled={busy !== null || i === items.length - 1}><ArrowDown size={16} aria-hidden="true" /></button>
                  <button type="button" className="btn btn-ghost text-red-600" style={{ width: 44, height: 44, padding: 0 }} aria-label={`Remove ${item.title}`} onClick={() => remove(item)} disabled={busy !== null}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialog}
    </Section>
  )
}
