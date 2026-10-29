/**
 * What the patient portal remembers on the patient's OWN device. Nothing here
 * is sent anywhere until the patient books, and no server lookup by phone
 * number exists — so a stranger typing someone's number learns nothing.
 *
 *  - saved patients: details to prefill the next booking (incl. family members)
 *  - bookings: appointment id + the secret token issued at booking, which is
 *    what authorises viewing/cancelling that one appointment
 *  - draft: the details entered so far, handed from /register to /book
 */
export interface SavedPatient {
  name: string
  phone: string
  dob: string // YYYY-MM-DD
  email?: string
  medicalHistory?: string
}

export interface SavedBooking {
  id: string
  token: string
  patientName: string
  startTime: string
}

export interface BookingDraft {
  patient: SavedPatient
  chiefComplaint?: string
}

const PROFILES = 'sc.patients'
const BOOKINGS = 'sc.bookings'
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

export const getBookings = (): SavedBooking[] => read(local(), BOOKINGS, [])

export function saveBooking(b: SavedBooking) {
  write(local(), BOOKINGS, [b, ...getBookings().filter(x => x.id !== b.id)].slice(0, 30))
}

export function removeBooking(id: string) {
  write(local(), BOOKINGS, getBookings().filter(x => x.id !== id))
}

export const getDraft = (): BookingDraft | null => read<BookingDraft | null>(session(), DRAFT, null)
export const setDraft = (d: BookingDraft | null) =>
  d ? write(session(), DRAFT, d) : (() => { try { session()?.removeItem(DRAFT) } catch { /* ignore */ } })()
