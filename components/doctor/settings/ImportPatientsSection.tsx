'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Section } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { readFailure, networkFailureText } from '@/lib/clientErrors'
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from '@/lib/patientImport'

interface Report {
  committed: boolean; added: number; total: number
  newCount: number; existingCount: number; repeatedCount: number; rejectedCount: number
  rejected: { line: number; name: string; phone: string; reason: string }[]
  sample: { name: string; phone: string; dob: string; gender: string | null }[]
}

/** Settings → Import patients: choose a CSV, see exactly what would happen, then confirm. Nothing is written before the confirmation. */
export function ImportPatientsSection() {
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [approximate, setApproximate] = useState(true)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)

  const send = async (text: string, commit: boolean, approx = approximate) => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/doctor/patients/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text, approximate: approx, commit }) })
      if (!res.ok) { setError(await readFailure(res, 'Could not read that file.')); if (!commit) setReport(null); return }
      setReport(await res.json())
    } catch { setError(networkFailureText()) } finally { setBusy(false) }
  }

  const choose = async (file: File) => {
    setReport(null); setError('')
    if (file.size > MAX_IMPORT_BYTES) { setError('That file is too large. Please use one under 2 MB.'); return }
    const text = await file.text()
    setCsv(text); setFileName(file.name)
    await send(text, false)
  }

  return (
    <Section title="Import patients" description={`Bring your patients from another system. Upload a CSV file with a first line naming the columns: name, phone, gender, dob (DD-MM-YYYY) or age. Optional: email, medical history. Up to ${MAX_IMPORT_ROWS} patients. You see a preview first, and nobody who is already here is added twice.`}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        <input ref={picker} type="file" className="hidden" accept=".csv,text/csv" aria-label="Choose a CSV file"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) choose(f) }} />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={approximate} disabled={busy || report?.committed}
            onChange={e => { setApproximate(e.target.checked); if (csv) send(csv, false, e.target.checked) }} />
          <span>The dates of birth in this file are only estimates (worked out from ages)</span>
        </label>
        <button type="button" className="btn btn-outline" onClick={() => picker.current?.click()} disabled={busy}>
          <Upload size={16} aria-hidden="true" /> {busy && !report ? 'Reading the file...' : 'Choose a CSV file'}
        </button>
        {fileName && <p className="text-xs text-slate-500">File: {fileName}</p>}

        {report && (
          <div className="space-y-3" aria-live="polite">
            {report.committed ? (
              <Alert variant="success">Done. {report.added} patients were added. Patients who were already here were not touched.</Alert>
            ) : (
              <Alert variant="info">
                Preview, nothing is saved yet: {report.total} lines in the file. {report.newCount} will be added, {report.existingCount} are already here, {report.repeatedCount} are repeated in the file, {report.rejectedCount} need a fix.
              </Alert>
            )}
            {!report.committed && report.sample.length > 0 && (
              <ul className="text-sm text-slate-600 list-disc pl-5">
                {report.sample.map((s, i) => <li key={i}>{s.name}, {s.phone}, born {s.dob}{s.gender ? `, ${s.gender.toLowerCase()}` : ''}</li>)}
              </ul>
            )}
            {report.rejected.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-amber-700">{report.rejectedCount} lines need a fix (they are skipped)</summary>
                <ul className="mt-2 space-y-1 text-slate-600">
                  {report.rejected.map(r => <li key={r.line}>Line {r.line}: {r.name || '(no name)'} {r.phone && `(${r.phone})`}. {r.reason}.</li>)}
                  {report.rejectedCount > report.rejected.length && <li>...and {report.rejectedCount - report.rejected.length} more.</li>}
                </ul>
              </details>
            )}
            {!report.committed && csv && report.newCount > 0 && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send(csv, true)}>
                {busy ? 'Importing...' : `Import ${report.newCount} patients`}
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
