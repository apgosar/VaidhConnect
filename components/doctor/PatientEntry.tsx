'use client'

import { useEffect, useState } from 'react'
import { Lock, X } from 'lucide-react'
import { ageFromDob } from '@/lib/time'
import { isGender, type Gender } from '@/lib/gender'
import { AgeDobFields, ageDobComplete, ageDobFromDob, emptyAgeDob, type AgeDob } from '@/components/ui/AgeDobFields'
import { GenderField } from '@/components/ui/GenderField'
import { SuggestInput, type Suggestion } from '@/components/ui/SuggestInput'

export interface KnownPatient { id: string; name: string; phone: string; dob?: string; gender?: string }

const DEFAULT_CODE = '+91'
export const digits = (s: string) => s.replace(/\D/g, '')
// Country calling codes people are likely to have, so a pasted "+971501234567" is split as +971 / 501234567.
const COUNTRY_CODES = new Set([
  '1', '7', '20', '27', '31', '32', '33', '34', '39', '41', '44', '45', '46', '47', '49', '52', '54', '55', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '234', '254', '255', '256', '880', '960', '961', '962', '963', '964',
  '965', '966', '967', '968', '971', '972', '973', '974', '975', '976', '977', '994', '995',
])
/** "+919800000001" gives { code: "+91", number: "9800000001" }. Without a "+", the digits are the number and the code stays +91. */
export function splitPhone(raw: string): { code: string; number: string } {
  const d = digits(raw)
  if (raw.trim().startsWith('+')) {
    for (const n of [3, 2, 1]) if (COUNTRY_CODES.has(d.slice(0, n)) && d.length - n >= 6) return { code: `+${d.slice(0, n)}`, number: d.slice(n) }
    if (d.length > 10) return { code: `+${d.slice(0, -10)}`, number: d.slice(-10) }
  }
  return { code: DEFAULT_CODE, number: d.length > 10 && d.startsWith('91') ? d.slice(-10) : d }
}
const ageOf = (dob?: string, today?: string) => (dob && today ? ageFromDob(dob.slice(0, 10), today) : undefined)

function toSuggestion(p: KnownPatient, today: string): Suggestion {
  const years = ageOf(p.dob, today)
  return { key: p.id, primary: p.name, secondary: `${p.phone}${years !== undefined ? ` · ${years} yrs` : ''}` }
}

/**
 * The patient part of Quick prescription and New appointment: type a mobile number or a name and pick a patient
 * the clinic already has from the dropdown (their details fill in and lock), or just carry on typing to add a new one.
 * `today` is the clinic's date (YYYY-MM-DD).
 */
export function usePatientEntry(today: string) {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  // Age and date of birth keep each other up to date; whichever was typed last is what is sent.
  const [ageDob, setAgeDob] = useState<AgeDob>(emptyAgeDob)
  const [gender, setGender] = useState<Gender | ''>('')
  // An existing patient picked from the dropdown: their details are filled in and locked.
  const [chosen, setChosen] = useState<KnownPatient | null>(null)
  const [searchFor, setSearchFor] = useState<{ source: 'name' | 'phone'; q: string } | null>(null)
  const [hits, setHits] = useState<KnownPatient[]>([])

  // Search the clinic's patients while the user types a name or a number.
  useEffect(() => {
    if (!searchFor || chosen) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchFor.q)}&limit=8`, { signal: controller.signal })
        if (res.ok) setHits((await res.json()).patients ?? [])
      } catch { /* searching is a convenience; the form works without it */ }
    }, 150)
    return () => { clearTimeout(timer); controller.abort() }
  }, [searchFor, chosen])

  const typeName = (v: string) => {
    setName(v)
    setSearchFor(v.trim().length >= 2 ? { source: 'name', q: v.trim() } : null)
  }
  const typeNumber = (raw: string) => {
    if (raw.trim().startsWith('+')) { const p = splitPhone(raw); setCode(p.code); setNumber(p.number) }
    else setNumber(digits(raw).slice(0, 14))
    const d = digits(raw).slice(-10)
    setSearchFor(d.length >= 3 ? { source: 'phone', q: d } : null)
  }
  const choose = (p: KnownPatient) => {
    const phone = splitPhone(p.phone)
    setChosen(p); setName(p.name); setCode(phone.code); setNumber(phone.number)
    setAgeDob(ageDobFromDob(p.dob?.slice(0, 10) ?? '', today))
    setGender(isGender(p.gender) ? p.gender : '')
    setSearchFor(null); setHits([])
  }
  const pick = (id: string) => { const p = hits.find(h => h.id === id); if (p) choose(p) }
  const clear = () => {
    setChosen(null); setName(''); setNumber(''); setAgeDob(emptyAgeDob()); setGender(''); setSearchFor(null); setHits([])
  }

  const reset = () => { clear(); setCode(DEFAULT_CODE) }

  const phone = `${code}${number}`
  const phoneOk = /^\+\d{1,4}$/.test(code) && /^\+\d{8,15}$/.test(phone)
  /** What is still missing, in words; empty when the patient is complete. */
  const problem =
    !phoneOk ? 'Enter the patient\'s mobile number.'
    : !chosen && name.trim().length < 2 ? 'Enter the patient\'s name.'
    : !chosen && !ageDobComplete(ageDob) ? 'Enter the patient\'s age or date of birth.'
    : !chosen && !gender ? 'Choose the patient\'s gender.'
    : ''

  return {
    today, code, setCode, number, name, ageDob, setAgeDob, gender, setGender, chosen, hits, searchFor,
    typeName, typeNumber, choose, pick, clear, reset, phone, phoneOk, problem,
    // A patient already on the books keeps the gender on their record; an older record without one can be given it here.
    genderLocked: !!chosen && isGender(chosen.gender),
  }
}
export type PatientEntryState = ReturnType<typeof usePatientEntry>

function LockMark() {
  return <Lock size={12} className="inline -mt-0.5" aria-label="locked" role="img" />
}

/** The fields. `idPrefix` keeps ids unique and stable; `numberHint` says what the number is used for. */
export function PatientEntryFields({ entry: e, idPrefix, numberHint }: { entry: PatientEntryState; idPrefix: string; numberHint: string }) {
  const chosen = e.chosen
  const nameSuggestions: Suggestion[] = e.searchFor?.source === 'name' && !chosen ? e.hits.map(h => toSuggestion(h, e.today)) : []
  const phoneSuggestions: Suggestion[] = e.searchFor?.source === 'phone' && !chosen ? e.hits.map(h => toSuggestion(h, e.today)) : []
  return (
    <>
      <p className="text-xs -mt-2" style={{ color: 'var(--color-sage)' }}>Start typing a name or a mobile number to pick a patient you already have. Otherwise fill in the rest to add a new patient.</p>

      {chosen && (
        <div className="flex items-center justify-between gap-2 rounded-lg p-3" style={{ background: 'var(--color-primary-bg)' }}>
          <p className="text-sm flex items-start gap-2"><Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>Existing patient.</strong> Their details are filled in and locked. To enter someone else, press &ldquo;Not them&rdquo;.</span></p>
          <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={e.clear}><X size={14} aria-hidden="true" /> Not them</button>
        </div>
      )}

      <div className="form-group">
        <label htmlFor={`${idPrefix}-number`} className="form-label">Mobile number {chosen ? <LockMark /> : <span aria-hidden="true" className="text-red-600">*</span>}</label>
        <div className="flex gap-2">
          <input aria-label="Country code" className="form-input text-center" style={{ width: '5rem', flexShrink: 0 }} inputMode="tel" value={e.code} disabled={!!chosen}
            onChange={ev => e.setCode(`+${digits(ev.target.value).slice(0, 4)}`)} />
          <div className="flex-1 min-w-0">
            <SuggestInput id={`${idPrefix}-number`} className="form-input" type="tel" inputMode="tel" placeholder="98765 43210" value={e.number} disabled={!!chosen}
              aria-describedby={`${idPrefix}-number-hint`} onChange={ev => e.typeNumber(ev.target.value)}
              suggestions={phoneSuggestions} onPick={e.pick} listLabel="Matching patients" />
          </div>
        </div>
        <p id={`${idPrefix}-number-hint`} className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>{numberHint}</p>
      </div>

      <div className="form-group">
        <label htmlFor={`${idPrefix}-name`} className="form-label">Name {chosen ? <LockMark /> : <span aria-hidden="true" className="text-red-600">*</span>}</label>
        <SuggestInput id={`${idPrefix}-name`} className="form-input" value={e.name} disabled={!!chosen} onChange={ev => e.typeName(ev.target.value)}
          suggestions={nameSuggestions} onPick={e.pick} listLabel="Matching patients" />
      </div>

      <AgeDobFields value={e.ageDob} onChange={e.setAgeDob} today={e.today} disabled={!!chosen} />

      <GenderField value={e.gender} onChange={e.setGender} disabled={e.genderLocked} required={!chosen} />
    </>
  )
}
