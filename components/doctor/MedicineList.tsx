'use client'

import { useId, useRef, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_TAPER_STEP_DAYS, DURATION_CHOICES, FREQUENCY_CHOICES, type Medicine, type TaperStep } from '@/lib/constants'
import { MAX_TAPER_STEPS, dayRangeLabel, taperSchedule, taperTotalDays } from '@/lib/taper'
import { emptyMedicine } from '@/lib/rxContent'
import { Chip, ChipRow } from '@/components/ui/Chip'

export { emptyMedicine }

interface Suggestion { name: string; dosage: string; frequency: string; duration: string; instructions?: string; taper?: Medicine['taper'] }

/**
 * The medicines part of a prescription: add and remove medicines, optional tapering doses, and suggestions
 * from what this clinic has prescribed before. Used by the appointment page and by Quick prescription.
 * Every field has a visible label and the usual answers are one tap, so it is usable one-handed on a phone.
 */
export function MedicineList({ medicines, onChange }: { medicines: Medicine[]; onChange: (next: Medicine[]) => void }) {
  const uid = useId()
  // Medicines this clinic has prescribed before, offered as the doctor types.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setMedicines = (fn: (prev: Medicine[]) => Medicine[]) => onChange(fn(medicines))
  const addMedicine = () => setMedicines(prev => [...prev, emptyMedicine()])
  const toggleTaper = (i: number, on: boolean) => setMedicines(prev => prev.map((m, idx) => {
    if (idx !== i || !!m.taper === on) return m
    if (!on) {
      const { taper, ...rest } = m
      return { ...rest, dosage: taper?.steps[0]?.dose ?? '', frequency: taper?.steps[0]?.frequency ?? '', duration: '' }
    }
    // Seed the first step from whatever was already typed for a fixed dose.
    return { ...m, taper: { steps: [{ dose: m.dosage, frequency: m.frequency === 'Tapering' ? '' : m.frequency, days: parseInt(m.duration) || DEFAULT_TAPER_STEP_DAYS }] } }
  }))
  const setSteps = (i: number, fn: (steps: TaperStep[]) => TaperStep[]) =>
    setMedicines(prev => prev.map((m, idx) => idx === i && m.taper ? { ...m, taper: { steps: fn(m.taper.steps) } } : m))
  const updateStep = (i: number, j: number, patch: Partial<TaperStep>) => setSteps(i, steps => steps.map((st, k) => k === j ? { ...st, ...patch } : st))
  const addStep = (i: number) => setSteps(i, steps => steps.length >= MAX_TAPER_STEPS ? steps : [...steps, { dose: '', frequency: steps[steps.length - 1]?.frequency ?? '', days: steps[steps.length - 1]?.days ?? DEFAULT_TAPER_STEP_DAYS }])
  const removeStep = (i: number, j: number) => setSteps(i, steps => steps.length > 1 ? steps.filter((_, k) => k !== j) : steps)
  const removeMedicine = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i))
  const askForSuggestions = (text: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (text.trim().length < 2) { setSuggestions([]); return }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/prescriptions/medicines?q=${encodeURIComponent(text.trim())}`)
        if (res.ok) setSuggestions((await res.json()).medicines ?? [])
      } catch { /* suggestions are a convenience; typing carries on without them */ }
    }, 250)
  }

  // Picking a remembered medicine from the list fills in how it was prescribed last time (blank fields only).
  const onNameChange = (i: number, value: string) => {
    askForSuggestions(value)
    const hit = suggestions.find(s => s.name.toLowerCase() === value.trim().toLowerCase())
    setMedicines(prev => prev.map((m, idx) => {
      if (idx !== i) return m
      const next = { ...m, name: value }
      const untouched = !m.dosage && !m.frequency && !m.duration && !m.taper
      if (hit && untouched) {
        next.dosage = hit.dosage; next.frequency = hit.frequency; next.duration = hit.duration
        if (hit.instructions) next.instructions = hit.instructions
        if (hit.taper) next.taper = hit.taper
      }
      return next
    }))
  }

  const updateMedicine = (i: number, field: keyof Medicine, value: string) => {
    setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  return (
    <>
      <datalist id={`${uid}-suggestions`}>
        {suggestions.map(s => <option key={s.name} value={s.name} />)}
      </datalist>
      <div>
        <div className="flex justify-between items-center mb-3">
          <p className="form-label mb-0">Medicines</p>
          <button type="button" onClick={addMedicine} className="btn btn-ghost btn-sm text-blue-600">
            <Plus size={14} aria-hidden="true" /> Add medicine
          </button>
        </div>

        <div className="space-y-3">
          {medicines.map((med, i) => {
            const base = `${uid}-m${i}`
            return (
              <div key={i} role="group" aria-label={`Medicine ${i + 1}`} className="bg-slate-50 rounded-xl p-3 sm:p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Medicine {i + 1}</span>
                  {medicines.length > 1 && (
                    <button type="button" onClick={() => removeMedicine(i)} className="text-red-600 hover:text-red-700 p-2 -m-2" aria-label={`Remove medicine ${i + 1}`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div>
                  <label htmlFor={`${base}-name`} className="form-label">Medicine name</label>
                  <input id={`${base}-name`} className="form-input" placeholder="e.g. Paracetamol" value={med.name}
                    list={`${uid}-suggestions`} autoComplete="off" onChange={e => onNameChange(i, e.target.value)} />
                </div>

                {/* One choice, two clear buttons: easier to read than a tick box */}
                <div role="group" aria-label={`Medicine ${i + 1} dose type`} className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1">
                  {([['Same dose', false], ['Tapering dose', true]] as const).map(([label, on]) => (
                    <button key={label} type="button" aria-pressed={!!med.taper === on} onClick={() => toggleTaper(i, on)}
                      className={`rounded-md px-2 py-2 text-sm font-medium transition-colors ${!!med.taper === on ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {med.taper ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">
                      Add each stage of the course, one after another. For example: <strong>40 mg for 5 days</strong>, then <strong>20 mg for 5 days</strong>.
                    </p>
                    {taperSchedule(med.taper.steps).map((line, j) => {
                      const step = med.taper!.steps[j]
                      const sid = `${base}-s${j}`
                      return (
                        <fieldset key={j} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 min-w-0">
                          <legend className="sr-only">Step {j + 1}</legend>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-800">Step {j + 1} <span className="font-normal text-slate-500">· {dayRangeLabel(line)}</span></p>
                            <button type="button" onClick={() => removeStep(i, j)} disabled={med.taper!.steps.length === 1}
                              className="text-red-600 hover:text-red-700 disabled:opacity-30 p-2 -m-2" aria-label={`Remove step ${j + 1}`}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>

                          <div>
                            <label htmlFor={`${sid}-dose`} className="form-label">Dose</label>
                            <input id={`${sid}-dose`} className="form-input" placeholder="e.g. 40 mg or 1 tablet" value={step.dose} onChange={e => updateStep(i, j, { dose: e.target.value })} />
                          </div>

                          <div>
                            <label htmlFor={`${sid}-freq`} className="form-label">How often</label>
                            <input id={`${sid}-freq`} className="form-input" placeholder="e.g. Once daily" value={step.frequency} onChange={e => updateStep(i, j, { frequency: e.target.value })} />
                            <ChipRow label="Common choices for how often">
                              {FREQUENCY_CHOICES.map(c => <Chip key={c} selected={step.frequency === c} onClick={() => updateStep(i, j, { frequency: c })}>{c}</Chip>)}
                            </ChipRow>
                          </div>

                          <div>
                            <label htmlFor={`${sid}-days`} className="form-label">For how many days</label>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => updateStep(i, j, { days: Math.max(1, line.days - 1) })} disabled={line.days <= 1}
                                className="btn btn-outline shrink-0 px-0 disabled:opacity-40" style={{ width: 44, height: 44 }} aria-label={`One day less for step ${j + 1}`}>
                                <Minus size={16} aria-hidden="true" />
                              </button>
                              <input id={`${sid}-days`} type="number" inputMode="numeric" min={1} max={365} className="form-input text-center min-w-0" style={{ maxWidth: '6rem' }} value={step.days}
                                onChange={e => updateStep(i, j, { days: Math.min(365, Math.max(1, parseInt(e.target.value) || 1)) })} />
                              <button type="button" onClick={() => updateStep(i, j, { days: Math.min(365, line.days + 1) })} disabled={line.days >= 365}
                                className="btn btn-outline shrink-0 px-0 disabled:opacity-40" style={{ width: 44, height: 44 }} aria-label={`One day more for step ${j + 1}`}>
                                <Plus size={16} aria-hidden="true" />
                              </button>
                              <span className="text-sm text-slate-600">{line.days === 1 ? 'day' : 'days'}</span>
                            </div>
                          </div>
                        </fieldset>
                      )
                    })}

                    <button type="button" onClick={() => addStep(i)} disabled={med.taper.steps.length >= MAX_TAPER_STEPS} className="btn btn-outline w-full disabled:opacity-50">
                      <Plus size={16} aria-hidden="true" /> Add next step
                    </button>

                    <div className="rounded-lg bg-white border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">What the patient will see</p>
                      <ul className="space-y-1 text-sm text-slate-700">
                        {taperSchedule(med.taper.steps).map((line, j) => (
                          <li key={j} className="flex flex-wrap gap-x-2">
                            <span className="font-medium">{dayRangeLabel(line)}:</span>
                            <span>{line.dose || <em className="text-slate-500">dose missing</em>}{line.frequency ? `, ${line.frequency}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-xs text-slate-500">{taperTotalDays(med.taper.steps)} days in all</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor={`${base}-dose`} className="form-label">Dosage</label>
                      <input id={`${base}-dose`} className="form-input" placeholder="e.g. 500 mg or 1 tablet" value={med.dosage} onChange={e => updateMedicine(i, 'dosage', e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`${base}-freq`} className="form-label">How often</label>
                      <input id={`${base}-freq`} className="form-input" placeholder="e.g. Twice daily" value={med.frequency} onChange={e => updateMedicine(i, 'frequency', e.target.value)} />
                      <ChipRow label="Common choices for how often">
                        {FREQUENCY_CHOICES.map(c => <Chip key={c} selected={med.frequency === c} onClick={() => updateMedicine(i, 'frequency', c)}>{c}</Chip>)}
                      </ChipRow>
                    </div>
                    <div>
                      <label htmlFor={`${base}-dur`} className="form-label">For how long</label>
                      <input id={`${base}-dur`} className="form-input" placeholder="e.g. 5 days" value={med.duration} onChange={e => updateMedicine(i, 'duration', e.target.value)} />
                      <ChipRow label="Common choices for how long">
                        {DURATION_CHOICES.map(c => <Chip key={c} selected={med.duration === c} onClick={() => updateMedicine(i, 'duration', c)}>{c}</Chip>)}
                      </ChipRow>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor={`${base}-note`} className="form-label">Instructions <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}>(optional)</span></label>
                  <input id={`${base}-note`} className="form-input" placeholder="e.g. After food" value={med.instructions ?? ''} onChange={e => updateMedicine(i, 'instructions', e.target.value)} />
                </div>
              </div>
            )
          })}
        </div>

        {medicines.length > 0 && medicines.some(m => m.name.trim()) && (
          <button type="button" onClick={addMedicine} className="btn btn-outline w-full mt-3">
            <Plus size={16} aria-hidden="true" /> Add another medicine
          </button>
        )}
      </div>
    </>
  )
}
