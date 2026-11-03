'use client'

import { useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import { DEFAULT_ADVICE, MAX_ADVICE_LENGTH, MAX_ADVICE_OPTIONS } from '@/lib/constants'
import { adviceOptionsOrDefault } from '@/lib/advice'
import { Section } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'

/**
 * Settings → Prescription advice: the ready-made advice the doctor ticks on a prescription
 * ("Avoid outside food"). Saved with the rest of the settings through `onChange`.
 */
export function AdviceSection({ value, onChange }: { value?: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const list = adviceOptionsOrDefault(value)

  const add = () => {
    const t = draft.trim().replace(/\s+/g, ' ')
    if (!t || list.some(a => a.toLowerCase() === t.toLowerCase()) || list.length >= MAX_ADVICE_OPTIONS) return
    onChange([...list, t])
    setDraft('')
  }

  return (
    <Section title="Prescription Advice" description="Ready-made advice for your prescriptions. When writing one, you just tap the ones you want; you can still add your own words for a particular patient.">
      {list.length === 0 && <p className="text-sm text-slate-500">No advice yet. Add your first below.</p>}
      <ul className="flex flex-wrap gap-2">
        {list.map(a => (
          <li key={a} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1 text-sm text-slate-700">
            <span className="[overflow-wrap:anywhere]">{a}</span>
            <button type="button" onClick={() => onChange(list.filter(x => x !== a))} aria-label={`Remove advice: ${a}`}
              className="flex shrink-0 items-center justify-center rounded-full text-slate-500 hover:text-red-600" style={{ width: 32, height: 32 }}>
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <TextField label="Add advice" value={draft} maxLength={MAX_ADVICE_LENGTH} placeholder="e.g. Avoid cold drinks"
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        </div>
        <Button variant="outline" onClick={add} disabled={!draft.trim() || list.length >= MAX_ADVICE_OPTIONS} className="shrink-0">
          <Plus size={16} aria-hidden="true" /> Add
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onChange([...DEFAULT_ADVICE])}>
        <RotateCcw size={14} aria-hidden="true" /> Use the suggested list
      </Button>
      <p className="text-xs text-slate-500">Remember to press Save Changes at the top.</p>
    </Section>
  )
}
