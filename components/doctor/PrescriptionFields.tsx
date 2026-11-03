'use client'

import type { Medicine } from '@/lib/constants'
import { addDaysYmd } from '@/lib/time'
import { MedicineList } from '@/components/doctor/MedicineList'

/** How soon the patient should come back, as one-tap choices next to the date. */
const FOLLOW_UP_CHOICES = [['3 days', 3], ['5 days', 5], ['1 week', 7], ['2 weeks', 14], ['1 month', 30]] as const

/**
 * What a prescription says: chief complaint, diagnosis, medicines, follow-up and notes. One component for the appointment page
 * and Quick prescription, so the two can never drift apart.
 * `baseDate` (YYYY-MM-DD) is the day the follow-up choices count from: the visit.
 */
export function PrescriptionFields({ chiefComplaint, onChiefComplaint, diagnosis, onDiagnosis, medicines, onMedicines, followUpDate, onFollowUpDate, notes, onNotes, baseDate }: {
  chiefComplaint: string; onChiefComplaint: (v: string) => void
  diagnosis: string; onDiagnosis: (v: string) => void
  medicines: Medicine[]; onMedicines: (v: Medicine[]) => void
  followUpDate: string; onFollowUpDate: (v: string) => void
  notes: string; onNotes: (v: string) => void
  baseDate: string
}) {
  return (
    <>
      <div className="form-group">
        <label htmlFor="chief-complaint" className="form-label">Chief complaint <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span></label>
        <textarea id="chief-complaint"
          className="form-textarea"
          value={chiefComplaint}
          onChange={e => onChiefComplaint(e.target.value)}
          placeholder="Why the patient came, e.g. Fever and headache for 3 days"
          maxLength={500}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label htmlFor="diagnosis" className="form-label">Diagnosis <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span></label>
        <textarea id="diagnosis"
          className="form-textarea"
          value={diagnosis}
          onChange={e => onDiagnosis(e.target.value)}
          placeholder="e.g. Upper respiratory tract infection"
          rows={2}
        />
      </div>

      <MedicineList medicines={medicines} onChange={onMedicines} />

      <div className="form-group">
        <label className="form-label" htmlFor="followUpDate">Follow-up visit <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span></label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="followUpDate" type="date" className="form-input" style={{ maxWidth: '12rem' }} min={baseDate} value={followUpDate} onChange={e => onFollowUpDate(e.target.value)} />
          {FOLLOW_UP_CHOICES.map(([label, n]) => (
            <button key={label} type="button" className="btn btn-ghost btn-sm" onClick={() => onFollowUpDate(addDaysYmd(baseDate, n))}>{label}</button>
          ))}
          {followUpDate && <button type="button" className="btn btn-ghost btn-sm text-red-500" onClick={() => onFollowUpDate('')}>Clear</button>}
        </div>
        <p className="text-xs text-slate-500 mt-1">Printed on the prescription. The patient also gets a WhatsApp reminder the day before.</p>
      </div>

      <div className="form-group">
        <label htmlFor="additional-notes" className="form-label">Additional Notes <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span></label>
        <textarea id="additional-notes"
          className="form-textarea"
          value={notes}
          onChange={e => onNotes(e.target.value)}
          placeholder="Diet restrictions, follow-up instructions..."
          rows={2}
        />
      </div>
    </>
  )
}
