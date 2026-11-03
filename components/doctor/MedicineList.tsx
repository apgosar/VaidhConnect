'use client'

import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Medicine, TaperStep } from '@/lib/constants'
import { MAX_TAPER_STEPS, dayRangeLabel, taperSchedule, taperTotalDays } from '@/lib/taper'

interface Suggestion { name: string; dosage: string; frequency: string; duration: string; instructions?: string; taper?: Medicine['taper'] }

export const emptyMedicine = (): Medicine => ({ name: '', dosage: '', frequency: '', duration: '' })

/**
 * The medicines part of a prescription: add and remove medicines, optional tapering doses, and suggestions
 * from what this clinic has prescribed before. Used by the appointment page and by Quick prescription.
 */
export function MedicineList({ medicines, onChange }: { medicines: Medicine[]; onChange: (next: Medicine[]) => void }) {
  // Medicines this clinic has prescribed before, offered as the doctor types.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setMedicines = (fn: (prev: Medicine[]) => Medicine[]) => onChange(fn(medicines))
  const addMedicine = () => setMedicines(prev => [...prev, emptyMedicine()])
  const toggleTaper = (i: number, on: boolean) => setMedicines(prev => prev.map((m, idx) => {
    if (idx !== i) return m
    if (!on) {
      const { taper, ...rest } = m
      return { ...rest, dosage: taper?.steps[0]?.dose ?? '', frequency: '', duration: '' }
    }
    // Seed the first step from whatever was already typed for a fixed dose.
    return { ...m, taper: { steps: [{ dose: m.dosage, frequency: m.frequency === 'Tapering' ? '' : m.frequency, days: parseInt(m.duration) || 5 }] } }
  }))
  const setSteps = (i: number, fn: (steps: TaperStep[]) => TaperStep[]) =>
    setMedicines(prev => prev.map((m, idx) => idx === i && m.taper ? { ...m, taper: { steps: fn(m.taper.steps) } } : m))
  const updateStep = (i: number, j: number, patch: Partial<TaperStep>) => setSteps(i, steps => steps.map((st, k) => k === j ? { ...st, ...patch } : st))
  const addStep = (i: number) => setSteps(i, steps => steps.length >= MAX_TAPER_STEPS ? steps : [...steps, { dose: '', frequency: steps[steps.length - 1]?.frequency ?? '', days: steps[steps.length - 1]?.days ?? 5 }])
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
      <datalist id="medicine-suggestions">
        {suggestions.map(s => <option key={s.name} value={s.name} />)}
      </datalist>
      <div>
        <div className="flex justify-between items-center mb-3">
          <p className="form-label mb-0">Medicines</p>
          <button onClick={addMedicine} className="btn btn-ghost btn-sm text-blue-600">
            <Plus size={14} /> Add Medicine
          </button>
        </div>

        <div className="space-y-3">
          {medicines.map((med, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Medicine {i + 1}</span>
                {medicines.length > 1 && (
                  <button onClick={() => removeMedicine(i)} className="text-red-600 hover:text-red-700 p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <input aria-label={`Medicine ${i + 1} name`}
                    className="form-input"
                    placeholder="Medicine name"
                    value={med.name}
                    list="medicine-suggestions"
                    autoComplete="off"
                    onChange={e => onNameChange(i, e.target.value)}
                  />
                </div>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={!!med.taper} onChange={e => toggleTaper(i, e.target.checked)} />
                  Tapering dose (the dose changes over the course)
                </label>
                {med.taper ? (
                  <div className="sm:col-span-2 space-y-2">
                    {taperSchedule(med.taper.steps).map((line, j) => (
                      <div key={j} className="grid grid-cols-12 gap-2 items-center">
                        <span className="col-span-12 sm:col-span-2 text-xs font-medium text-slate-500">{dayRangeLabel(line)}</span>
                        <input className="form-input col-span-6 sm:col-span-3" placeholder="Dose, e.g. 40 mg" value={med.taper!.steps[j].dose} onChange={e => updateStep(i, j, { dose: e.target.value })} aria-label={`Step ${j + 1} dose`} />
                        <input className="form-input col-span-6 sm:col-span-4" placeholder="How often" value={med.taper!.steps[j].frequency} onChange={e => updateStep(i, j, { frequency: e.target.value })} aria-label={`Step ${j + 1} frequency`} />
                        <input type="number" min={1} max={365} className="form-input col-span-9 sm:col-span-2" placeholder="Days" value={med.taper!.steps[j].days} onChange={e => updateStep(i, j, { days: Math.max(1, parseInt(e.target.value) || 1) })} aria-label={`Step ${j + 1} days`} />
                        <button type="button" onClick={() => removeStep(i, j)} disabled={med.taper!.steps.length === 1} className="col-span-3 sm:col-span-1 text-red-600 hover:text-red-700 disabled:opacity-30 justify-self-end" aria-label={`Remove step ${j + 1}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => addStep(i)} disabled={med.taper.steps.length >= MAX_TAPER_STEPS} className="btn btn-ghost btn-sm text-blue-600"><Plus size={14} /> Add step</button>
                      <span className="text-xs text-slate-500">Total {taperTotalDays(med.taper.steps)} days</span>
                    </div>
                    <input aria-label={`Medicine ${i + 1} instructions`} className="form-input" placeholder="Instructions (optional)" value={med.instructions ?? ''} onChange={e => updateMedicine(i, 'instructions', e.target.value)} />
                  </div>
                ) : (
                  <>
                    <input aria-label={`Medicine ${i + 1} dosage`} className="form-input" placeholder="Dosage (e.g. 500mg)" value={med.dosage} onChange={e => updateMedicine(i, 'dosage', e.target.value)} />
                    <input aria-label={`Medicine ${i + 1} frequency`} className="form-input" placeholder="Frequency (e.g. 3x daily)" value={med.frequency} onChange={e => updateMedicine(i, 'frequency', e.target.value)} />
                    <input aria-label={`Medicine ${i + 1} duration`} className="form-input" placeholder="Duration (e.g. 5 days)" value={med.duration} onChange={e => updateMedicine(i, 'duration', e.target.value)} />
                    <input aria-label={`Medicine ${i + 1} instructions`} className="form-input" placeholder="Instructions (optional)" value={med.instructions ?? ''} onChange={e => updateMedicine(i, 'instructions', e.target.value)} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
