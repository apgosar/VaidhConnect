'use client'

import { useId } from 'react'
import { Plus, X } from 'lucide-react'
import { MAX_CLINIC_PHONES } from '@/lib/clinicPhones'

/**
 * The clinic's phone numbers: one box per number with an add button. The first is the main one (it is the one the
 * landing page's Call and WhatsApp buttons use); every number is printed in the messages patients receive.
 * `lockFirst` shows the first as fixed, when it is set to follow the doctor's WhatsApp number.
 */
export function ClinicPhonesField({ value, onChange, lockFirst }: {
  value: string[]
  onChange: (next: string[]) => void
  lockFirst?: boolean
}) {
  const uid = useId()
  const rows = value.length > 0 ? value : ['']
  const set = (i: number, v: string) => onChange(rows.map((p, k) => (k === i ? v : p)))
  const remove = (i: number) => onChange(rows.filter((_, k) => k !== i))

  return (
    <div className="space-y-2">
      <p className="form-label" id={`${uid}-label`}>Clinic phone numbers</p>
      <div role="group" aria-labelledby={`${uid}-label`} className="space-y-2">
        {rows.map((p, i) => {
          const locked = i === 0 && lockFirst
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                id={`${uid}-${i}`} type="tel" inputMode="tel" className="form-input min-w-0 flex-1" placeholder="+91 98765 43210"
                aria-label={i === 0 ? 'Clinic phone, main number' : `Clinic phone ${i + 1}`}
                value={p} disabled={locked} style={locked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                onChange={e => set(i, e.target.value)}
              />
              {rows.length > 1 && !locked && (
                <button type="button" onClick={() => remove(i)} aria-label={`Remove phone ${i + 1}`}
                  className="flex shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-red-600" style={{ width: 44, height: 44 }}>
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {rows.length < MAX_CLINIC_PHONES && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...rows, ''])}>
          <Plus size={14} aria-hidden="true" /> Add another number
        </button>
      )}
    </div>
  )
}
