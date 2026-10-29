/**
 * What the patient portal remembers on the patient's OWN device, purely for
 * convenience. It holds no secrets: the PIN is never stored here, and nothing
 * here lets anyone see or change an appointment.
 *
 *  - saved patients: details to prefill the next booking (incl. family members)
 *  - draft: the details entered so far, handed from /register to /book
 */
export interface SavedPatient {
  name: string
  phone: string
  dob: string // YYYY-MM-DD
  email?: string
  medicalHistory?: string
}

export interface BookingDraft {
  patient: SavedPatient
  chiefComplaint?: string
}

const PROFILES = 'sc.patients'
const DRAFT = 'sc.draft'

function read<T>(storage: Storage | undefined, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(storage: Storage | undefined, key: string, value: unknown) {
  try { storage?.setItem(key, JSON.stringify(value)) } catch { /* private mode / quota: degrade silently */ }
}

const local = () => (typeof window === 'undefined' ? undefined : window.localStorage)
const session = () => (typeof window === 'undefined' ? undefined : window.sessionStorage)

export const getSavedPatients = (): SavedPatient[] => read(local(), PROFILES, [])

export function savePatient(p: SavedPatient) {
  const same = (a: SavedPatient) => a.phone === p.phone && a.name.toLowerCase() === p.name.toLowerCase() && a.dob === p.dob
  write(local(), PROFILES, [p, ...getSavedPatients().filter(x => !same(x))].slice(0, 6))
}

export const getDraft = (): BookingDraft | null => read<BookingDraft | null>(session(), DRAFT, null)
export const setDraft = (d: BookingDraft | null) =>
  d ? write(session(), DRAFT, d) : (() => { try { session()?.removeItem(DRAFT) } catch { /* ignore */ } })()
