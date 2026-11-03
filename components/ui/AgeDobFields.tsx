'use client'

import { useId } from 'react'
import { Lock } from 'lucide-react'
import { ageFromDob, dobFromAge } from '@/lib/time'

/** Age and date of birth side by side. Whichever was typed last is the one that counts; the other is worked out from it. */
export interface AgeDob { age: string; dob: string; entered: 'age' | 'dob' }

export const emptyAgeDob = (): AgeDob => ({ age: '', dob: '', entered: 'age' })

/** For a person whose date of birth is on record. */
export const ageDobFromDob = (dob: string, today: string): AgeDob =>
  ({ dob, age: dob ? String(Math.max(0, ageFromDob(dob, today))) : '', entered: 'dob' })

const validAge = (age: string) => age !== '' && Number(age) >= 0 && Number(age) <= 120

/** True when there is something usable: a sensible age, or a date of birth. */
export const ageDobComplete = (v: AgeDob) => (v.entered === 'age' ? validAge(v.age) : !!v.dob)

/** What the server wants: an age (it stores an estimated date of birth) or the exact date of birth. */
export const ageDobPayload = (v: AgeDob): { ageYears: number } | { dob: string } =>
  v.entered === 'age' ? { ageYears: Number(v.age) } : { dob: v.dob }

/** For endpoints that always want a date of birth: the real one, or one worked out from the age and flagged as an estimate. */
export const ageDobAsDob = (v: AgeDob, today: string): { dob: string; dobApproximate?: true } =>
  v.entered === 'age' ? { dob: dobFromAge(Number(v.age), today), dobApproximate: true } : { dob: v.dob }

/**
 * The same two boxes everywhere a patient is added (Quick prescription, new appointment, the patient's own booking):
 * type an age and the date of birth appears, or the other way round. `today` is the clinic's date (YYYY-MM-DD).
 */
export function AgeDobFields({ value, onChange, today, disabled, required = true, hint = true }: {
  value: AgeDob
  onChange: (next: AgeDob) => void
  today: string
  /** Locked, because the details belong to a patient already on the books. */
  disabled?: boolean
  required?: boolean
  hint?: boolean
}) {
  const uid = useId()
  const mark = disabled ? <Lock size={12} className="inline -mt-0.5" aria-label="locked" role="img" /> : required ? <span aria-hidden="true" className="text-red-600">*</span> : null

  const typeAge = (raw: string) => {
    const age = raw.replace(/\D/g, '').slice(0, 3)
    onChange({ age, entered: 'age', dob: age !== '' && Number(age) <= 120 ? dobFromAge(Number(age), today) : '' })
  }
  const typeDob = (dob: string) => onChange({ dob, entered: 'dob', age: dob ? String(Math.max(0, ageFromDob(dob, today))) : '' })

  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0, 6.5rem) minmax(0, 1fr)' }}>
        <div className="form-group">
          <label htmlFor={`${uid}-age`} className="form-label">Age {mark}</label>
          <input id={`${uid}-age`} className="form-input" inputMode="numeric" placeholder="Years" value={value.age} disabled={disabled} onChange={e => typeAge(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-dob`} className="form-label">Date of birth {mark}</label>
          <input id={`${uid}-dob`} className="form-input" type="date" max={today} value={value.dob} disabled={disabled} onChange={e => typeDob(e.target.value)} />
        </div>
      </div>
      {hint && !disabled && (
        <p className="text-xs -mt-2" style={{ color: 'var(--color-sage)' }}>
          Enter either one. The other is worked out for you{value.entered === 'age' && value.dob ? ' (the date of birth is an estimate from the age)' : ''}.
        </p>
      )}
    </>
  )
}
