'use client'

import { useId } from 'react'
import { Lock } from 'lucide-react'
import { GENDERS, GENDER_LABEL, type Gender } from '@/lib/gender'

/**
 * Male / Female / Other as three large radio buttons, one tap to choose. `disabled` shows it locked
 * (the patient is already on the books with this gender).
 */
export function GenderField({ value, onChange, disabled, required = true }: {
  value: Gender | ''
  onChange: (next: Gender) => void
  disabled?: boolean
  required?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="form-group min-w-0" disabled={disabled}>
      <legend className="form-label">
        Gender {disabled ? <Lock size={12} className="inline -mt-0.5" aria-label="locked" role="img" /> : required ? <span aria-hidden="true" className="text-red-600">*</span> : null}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {GENDERS.map(g => (
          <label key={g} className={`relative flex items-center justify-center rounded-lg border text-sm font-medium transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${value === g ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'} focus-within:ring-2 focus-within:ring-blue-300`} style={{ minHeight: 44 }}>
            <input type="radio" name={name} value={g} aria-label={GENDER_LABEL[g]} checked={value === g} onChange={() => onChange(g)} className="sr-only" />
            {GENDER_LABEL[g]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
