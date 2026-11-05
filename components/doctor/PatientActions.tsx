'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { AgeDobFields, ageDobComplete, ageDobFromDob, type AgeDob } from '@/components/ui/AgeDobFields'
import { GenderField } from '@/components/ui/GenderField'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { isGender, type Gender } from '@/lib/gender'
import { readFailure, networkFailureText } from '@/lib/clientErrors'

export interface EditablePatient {
  id: string; name: string; phone: string; email?: string | null; medicalHistory?: string | null
  /** YYYY-MM-DD */ dob?: string; dobApproximate?: boolean; gender?: string | null; hasVisits: boolean
}

/** Edit and delete buttons for a patient. Deleting one who has visits warns that their records go too. */
export default function PatientActions({ patient, today }: { patient: EditablePatient; today: string }) {
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(patient.name)
  const [phone, setPhone] = useState(patient.phone)
  const [email, setEmail] = useState(patient.email ?? '')
  const [history, setHistory] = useState(patient.medicalHistory ?? '')
  const [ageDob, setAgeDob] = useState<AgeDob>(() => ageDobFromDob(patient.dob ?? '', today))
  const [gender, setGender] = useState<Gender | ''>(isGender(patient.gender) ? patient.gender : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const valid = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 8 && ageDobComplete(ageDob)

  const save = async () => {
    setBusy(true); setError('')
    try {
      const changedBirth = ageDob.dob !== (patient.dob ?? '')
      const res = await fetch('/api/patients', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: patient.id, name, phone, email, medicalHistory: history, ...(gender ? { gender } : {}),
          // An age typed here is an estimate; an untouched date of birth keeps whatever it was.
          ...(changedBirth ? { dob: ageDob.dob, dobApproximate: ageDob.entered === 'age' } : {}),
        }),
      })
      if (!res.ok) { setError(await readFailure(res, 'Could not save the changes.')); return }
      setOpen(false)
      router.refresh()
    } catch { setError(networkFailureText()) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${patient.name}?`, message: patient.hasVisits ? 'Deleting this patient will also delete all associated visit records and prescriptions. This cannot be undone. Are you sure you want to delete?' : 'This removes the patient from your list. It cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    try {
      const res = await fetch(`/api/patients?id=${encodeURIComponent(patient.id)}`, { method: 'DELETE' })
      if (!res.ok) { await confirm({ title: 'Could not delete', message: await readFailure(res, 'Could not delete this patient.'), confirmLabel: 'OK', cancelLabel: 'Close' }); return }
      router.push('/doctor/patients'); router.refresh()
    } catch { await confirm({ title: 'Could not delete', message: networkFailureText(), confirmLabel: 'OK', cancelLabel: 'Close' }) }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setOpen(true)}><Pencil size={16} aria-hidden="true" /> Edit patient</Button>
        <Button variant="outline" onClick={remove} aria-label={`Delete ${patient.name}`}><Trash2 size={16} aria-hidden="true" /> Delete</Button>
      </div>

      <Modal open={open} title="Edit patient" onClose={() => !busy && setOpen(false)} size="lg">
        <div className="space-y-3">
          <div className="form-group"><label htmlFor="pe-name" className="form-label">Full name *</label><input id="pe-name" className="form-input" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="pe-phone" className="form-label">Mobile (with country code) *</label><input id="pe-phone" className="form-input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <AgeDobFields value={ageDob} onChange={setAgeDob} today={today} />
          <GenderField value={gender} onChange={setGender} required={false} />
          <div className="form-group"><label htmlFor="pe-email" className="form-label">Email (optional)</label><input id="pe-email" type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="pe-history" className="form-label">Medical history (optional)</label><textarea id="pe-history" className="form-textarea" rows={3} maxLength={2000} value={history} onChange={e => setHistory(e.target.value)} /></div>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} loading={busy} disabled={!valid}>Save changes</Button>
          </div>
        </div>
      </Modal>
      {dialog}
    </>
  )
}
