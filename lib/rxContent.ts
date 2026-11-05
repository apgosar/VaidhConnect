import type { Medicine } from './constants'

/** Everything the doctor fills in for a prescription, as the forms hold it. */
export interface RxContent {
  chiefComplaint: string
  onExamination: string
  diagnosis: string
  medicines: Medicine[]
  investigations: string
  /** Ticked items of the clinic's advice list. */
  advice: string[]
  /** Advice written for this patient, beyond the list. */
  adviceOther: string
  followUpDate: string
  notes: string
}

export const emptyMedicine = (): Medicine => ({ name: '', dosage: '', frequency: '', duration: '' })

export const emptyRx = (): RxContent => ({
  chiefComplaint: '', onExamination: '', diagnosis: '', medicines: [emptyMedicine()],
  investigations: '', advice: [], adviceOther: '', followUpDate: '', notes: '',
})

/** The JSON the prescription endpoints take. Blank text is sent as null so it clears a field that was filled before. */
export function rxToPayload(rx: RxContent) {
  const t = (v: string) => v.trim() || null
  return {
    chiefComplaint: t(rx.chiefComplaint),
    onExamination: t(rx.onExamination),
    diagnosis: t(rx.diagnosis),
    medicines: rx.medicines.filter(m => m.name.trim()),
    investigations: t(rx.investigations),
    advice: rx.advice,
    adviceOther: t(rx.adviceOther),
    notes: t(rx.notes),
    followUpDate: rx.followUpDate || null,
  }
}

/** A comparable snapshot, to tell whether the form holds edits that are not saved yet. */
export const rxSnapshot = (rx: RxContent) => JSON.stringify(rxToPayload(rx))

/** Turns a stored prescription (and the visit's complaint) back into form values. */
export function rxFromStored(rx: any, chiefComplaint?: string | null): RxContent {
  const base = emptyRx()
  return {
    chiefComplaint: chiefComplaint ?? '',
    onExamination: rx?.onExamination ?? '',
    diagnosis: rx?.diagnosis ?? '',
    medicines: rx?.medicines?.length ? rx.medicines : base.medicines,
    investigations: rx?.investigations ?? '',
    advice: Array.isArray(rx?.advice) ? rx.advice : [],
    adviceOther: rx?.adviceOther ?? '',
    followUpDate: rx?.followUpDate ?? '',
    notes: rx?.notes ?? '',
  }
}

/**
 * A prescription needs something to say, but not necessarily a medicine: sometimes advice alone is the treatment.
 * True when any part of the content (as the forms or the endpoints hold it) has been filled in.
 */
export function rxHasContent(rx: {
  medicines?: { name: string }[]; advice?: string[]; adviceOther?: string | null; diagnosis?: string | null
  onExamination?: string | null; investigations?: string | null; notes?: string | null
}): boolean {
  const said = (v?: string | null) => !!v?.trim()
  return !!rx.medicines?.some(m => said(m.name)) || !!rx.advice?.some(said) || said(rx.adviceOther) || said(rx.diagnosis)
    || said(rx.onExamination) || said(rx.investigations) || said(rx.notes)
}
