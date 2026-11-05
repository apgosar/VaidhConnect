'use client'

import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { DEFAULT_MARGINS, MARGIN_LIMITS, type PrintMargins } from '@/lib/pdf/layout'
import { failureText, networkFailureText } from '@/lib/clientErrors'
import { Section } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export interface PrintingValue {
  printSettings?: PrintMargins
  letterheadPath?: string | null
  signaturePath?: string | null
}

/**
 * Settings → Prescription Printing: the digital letterhead (uploaded on its own, not with Save) and the
 * spacing for pre-printed paper (saved with the rest of the settings through `onChange`).
 */
export function PrintingSection({ value, onChange }: {
  value: PrintingValue
  onChange: (patch: PrintingValue) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const signInput = useRef<HTMLInputElement>(null)
  const [found, setFound] = useState<{ header: boolean; footer: boolean } | null>(null)
  const [signVersion, setSignVersion] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(() => Date.now()) // busts the preview image cache after an upload
  const { confirm, dialog } = useConfirm()

  const margins: PrintMargins = { ...DEFAULT_MARGINS, ...(value.printSettings ?? {}) }
  const setMargin = (key: keyof PrintMargins, raw: string) =>
    onChange({ printSettings: { ...margins, [key]: raw === '' ? 0 : Number(raw) } })

  const upload = async (file: File) => {
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('letterhead', file)
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(failureText(data, 'Could not upload the letterhead')); return }
      onChange({ letterheadPath: data.doctor?.letterheadPath ?? 'set', ...(data.doctor?.printSettings ? { printSettings: data.doctor.printSettings } : {}) })
      setFound(data.found ?? null)
      setVersion(Date.now())
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const uploadSignature = async (file: File) => {
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('signature', file)
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(failureText(data, 'Could not upload the signature')); return }
      onChange({ signaturePath: data.doctor?.signaturePath ?? 'set' })
      setSignVersion(Date.now())
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
      if (signInput.current) signInput.current.value = ''
    }
  }

  const removeSignature = async () => {
    if (!(await confirm({ title: 'Remove the signature?', message: 'Prescriptions will show only your name and details.', confirmLabel: 'Remove', danger: true }))) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removeSignature: true }) })
      if (!res.ok) { setError(failureText(await res.json().catch(() => ({})), 'Could not remove the signature')); return }
      onChange({ signaturePath: null })
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Remove the letterhead?', message: 'Prescriptions will go back to the standard header.', confirmLabel: 'Remove', danger: true }))) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removeLetterhead: true }) })
      if (!res.ok) { setError(failureText(await res.json().catch(() => ({})), 'Could not remove the letterhead')); return }
      onChange({ letterheadPath: null })
    } catch {
      setError(networkFailureText())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Prescription Printing">
      {dialog}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Letterhead</p>
          <p className="text-sm text-slate-500">
            Upload your letterhead as one A4 page: a PDF (best, it stays sharp) or a JPG or PNG picture, up to 5 MB. Keep both the header and the footer on it, but leave out the doctor name, qualifications, registration number and signature, because we print those. Prescriptions, downloads and WhatsApp copies are then written in the empty space between your header and footer. Without a letterhead, the standard header with your logo and details is used.
          </p>
        </div>
        {value.letterheadPath ? (
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/doctor/letterhead?v=${version}`} alt="Your letterhead" className="w-28 rounded border border-slate-200 shadow-sm" />
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
                <Upload size={14} aria-hidden="true" /> {busy ? 'Uploading...' : 'Replace'}
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600 block" disabled={busy} onClick={remove}>
                <X size={14} aria-hidden="true" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={14} aria-hidden="true" /> {busy ? 'Uploading...' : 'Upload letterhead'}
          </Button>
        )}
        <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" aria-label="Choose a letterhead file" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        {found && (
          <p className="text-sm text-slate-600" role="status">
            {found.header && found.footer
              ? `Found your header and footer. Text is placed between them: ${margins.top} mm from the top and ${margins.bottom} mm from the bottom. You can fine-tune this below.`
              : `We found ${found.header ? 'a header but no footer' : found.footer ? 'a footer but no header' : 'no header or footer'} on this page. Check the spacing below.`}
          </p>
        )}
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Signature</p>
          <p className="text-sm text-slate-500">
            A picture of your signature (PNG with a transparent or white background works best, up to 2 MB). It is printed above your name at the end of every prescription.
          </p>
        </div>
        {value.signaturePath ? (
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/doctor/signature?v=${signVersion}`} alt="Your signature" className="h-16 max-w-48 rounded border border-slate-200 bg-white object-contain p-1" />
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => signInput.current?.click()}>
                <Upload size={14} aria-hidden="true" /> Replace
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600 block" disabled={busy} onClick={removeSignature}>
                <X size={14} aria-hidden="true" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => signInput.current?.click()}>
            <Upload size={14} aria-hidden="true" /> Upload signature
          </Button>
        )}
        <input ref={signInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Choose a signature picture" onChange={e => { const f = e.target.files?.[0]; if (f) uploadSignature(f) }} />
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Spacing for pre-printed letterhead paper</p>
          <p className="text-sm text-slate-500">
            When you tick &quot;Print on letterhead&quot;, the prescription is printed without our header or footer. These gaps (in millimetres) keep the text clear of your printed header and footer.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['top', 'bottom', 'left', 'right'] as const).map(key => (
            <TextField
              key={key} label={`${key[0].toUpperCase()}${key.slice(1)} (mm)`} type="number" inputMode="decimal" step="0.5"
              min={MARGIN_LIMITS[key][0]} max={MARGIN_LIMITS[key][1]}
              value={margins[key]} onChange={e => setMargin(key, e.target.value)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <a href="/api/doctor/print-test?mode=preprinted" target="_blank" rel="noopener" className="btn btn-outline btn-sm">Print a test page (pre-printed paper)</a>
          <a href="/api/doctor/print-test?mode=standard" target="_blank" rel="noopener" className="btn btn-ghost btn-sm">Preview standard layout</a>
        </div>
        <p className="text-xs text-slate-500">Save your changes first. The test page uses the saved spacing. Print it on your letterhead paper at 100% scale (not &quot;fit to page&quot;) and adjust until the text sits where you want it.</p>
      </div>
    </Section>
  )
}
