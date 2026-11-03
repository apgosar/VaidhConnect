'use client'

import { useId } from 'react'
import { INVESTIGATION_CHOICES } from '@/lib/constants'
import { addDaysYmd } from '@/lib/time'
import type { RxContent } from '@/lib/rxContent'
import { MedicineList } from '@/components/doctor/MedicineList'
import { useAdviceOptions } from '@/components/doctor/useAdviceOptions'
import { Chip, ChipRow } from '@/components/ui/Chip'

/** How soon the patient should come back, as one-tap choices next to the date. */
const FOLLOW_UP_CHOICES = [['3 days', 3], ['1 week', 7], ['1 month', 30], ['3 months', 90]] as const

const Optional = () => <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span>

/** "CBC, HbA1c" → ["CBC", "HbA1c"] */
const tokens = (s: string) => s.split(/[,\n]/).map(t => t.trim()).filter(Boolean)

/**
 * What a prescription says: complaint, examination, diagnosis, medicines, investigations, advice, follow-up and notes.
 * One component for the appointment page and Quick prescription, so the two can never drift apart.
 * `baseDate` (YYYY-MM-DD) is the day the follow-up choices count from: the visit.
 */
export function PrescriptionFields({ value, onChange, baseDate }: {
  value: RxContent
  onChange: (patch: Partial<RxContent>) => void
  baseDate: string
}) {
  const uid = useId()
  const adviceList = useAdviceOptions()
  // Advice already ticked on this prescription stays visible even if the clinic has since removed it from its list.
  const adviceChoices = [...adviceList, ...value.advice.filter(a => !adviceList.some(o => o.toLowerCase() === a.toLowerCase()))]
  const toggleAdvice = (a: string) => onChange({ advice: value.advice.includes(a) ? value.advice.filter(x => x !== a) : [...value.advice, a] })

  const hasTest = (t: string) => tokens(value.investigations).some(x => x.toLowerCase() === t.toLowerCase())
  const toggleTest = (t: string) => onChange({
    investigations: (hasTest(t) ? tokens(value.investigations).filter(x => x.toLowerCase() !== t.toLowerCase()) : [...tokens(value.investigations), t]).join(', '),
  })

  return (
    <>
      <div className="form-group">
        <label htmlFor={`${uid}-cc`} className="form-label">Chief complaint <Optional /></label>
        <textarea id={`${uid}-cc`} className="form-textarea" value={value.chiefComplaint} onChange={e => onChange({ chiefComplaint: e.target.value })}
          placeholder="Why the patient came, e.g. Fever and headache for 3 days" maxLength={500} rows={2} />
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-oe`} className="form-label">On examination (O/E) <Optional /></label>
        <textarea id={`${uid}-oe`} className="form-textarea" value={value.onExamination} onChange={e => onChange({ onExamination: e.target.value })}
          placeholder="e.g. BP 120/80 mmHg, pulse 76/min, SpO2 98%, temperature 99.2 F" maxLength={1000} rows={2} />
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-dx`} className="form-label">Diagnosis <Optional /></label>
        <textarea id={`${uid}-dx`} className="form-textarea" value={value.diagnosis} onChange={e => onChange({ diagnosis: e.target.value })}
          placeholder="e.g. Upper respiratory tract infection" rows={2} />
      </div>

      <MedicineList medicines={value.medicines} onChange={medicines => onChange({ medicines })} />

      <div className="form-group">
        <label htmlFor={`${uid}-inv`} className="form-label">Advised investigations <Optional /></label>
        <textarea id={`${uid}-inv`} className="form-textarea" value={value.investigations} onChange={e => onChange({ investigations: e.target.value })}
          placeholder="Tap below, or type, e.g. CBC, fasting sugar, HbA1c" maxLength={1000} rows={2} />
        <ChipRow label="Common investigations">
          {INVESTIGATION_CHOICES.map(t => <Chip key={t} selected={hasTest(t)} onClick={() => toggleTest(t)}>{t}</Chip>)}
        </ChipRow>
      </div>

      <div className="form-group">
        <p id={`${uid}-adv`} className="form-label">Advice <Optional /></p>
        {adviceChoices.length > 0 ? (
          <div role="group" aria-labelledby={`${uid}-adv`} className="flex flex-wrap gap-1.5">
            {adviceChoices.map(a => <Chip key={a} selected={value.advice.includes(a)} onClick={() => toggleAdvice(a)} className="whitespace-normal text-left">{a}</Chip>)}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No ready-made advice yet. Add your own list in Settings, or type below.</p>
        )}
        <label htmlFor={`${uid}-adv-other`} className="sr-only">Other advice</label>
        <textarea id={`${uid}-adv-other`} className="form-textarea mt-2" value={value.adviceOther} onChange={e => onChange({ adviceOther: e.target.value })}
          placeholder="Anything else to advise this patient" maxLength={1000} rows={2} />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={`${uid}-fu`}>Follow-up visit <Optional /></label>
        <div className="flex flex-wrap items-center gap-2">
          <input id={`${uid}-fu`} type="date" className="form-input" style={{ maxWidth: '12rem' }} min={baseDate} value={value.followUpDate} onChange={e => onChange({ followUpDate: e.target.value })} />
          {value.followUpDate && <button type="button" className="btn btn-ghost btn-sm text-red-500" onClick={() => onChange({ followUpDate: '' })}>Clear</button>}
        </div>
        <ChipRow label="Follow-up after">
          {FOLLOW_UP_CHOICES.map(([label, n]) => <Chip key={label} selected={value.followUpDate === addDaysYmd(baseDate, n)} onClick={() => onChange({ followUpDate: addDaysYmd(baseDate, n) })}>{label}</Chip>)}
        </ChipRow>
        <p className="text-xs text-slate-500 mt-1">Printed on the prescription. The patient also gets a WhatsApp reminder the day before.</p>
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-notes`} className="form-label">Additional Notes <Optional /></label>
        <textarea id={`${uid}-notes`} className="form-textarea" value={value.notes} onChange={e => onChange({ notes: e.target.value })}
          placeholder="Anything else for the patient..." rows={2} />
      </div>
    </>
  )
}
