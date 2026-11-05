'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { readFailure, networkFailureText } from '@/lib/clientErrors'
import { EditPatientDialog, type EditablePatient } from '@/components/doctor/EditPatientDialog'

export type { EditablePatient }

/** Edit and delete buttons for a patient. Deleting one who has visits warns that their records go too. */
export default function PatientActions({ patient, today }: { patient: EditablePatient; today: string }) {
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState(false)

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
      <EditPatientDialog patient={patient} today={today} open={open} onClose={() => setOpen(false)} onSaved={() => router.refresh()} />
      {dialog}
    </>
  )
}
