export const MAX_CLINIC_PHONES = 5

/** A clinic profile record (or anything with `phone` / `phones`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PhoneSource = { [k: string]: any } | null | undefined

/** The clinic's numbers, first one is the main one. Older clinics only have the single `phone`. */
export function clinicPhones(d: PhoneSource): string[] {
  const list = Array.isArray(d?.phones) ? d!.phones.filter((p): p is string => typeof p === 'string' && p.trim() !== '') : []
  if (list.length > 0) return list.map(p => p.trim())
  return typeof d?.phone === 'string' && d.phone.trim() ? [d.phone.trim()] : []
}

/**
 * All the numbers as one piece of text for a message ("+91 98765 43210, +91 91234 56789"), or `fallback` when there are
 * none. One line, no tabs or runs of spaces, so it is safe as a WhatsApp template variable.
 */
export const clinicPhoneText = (d: PhoneSource, fallback = ''): string =>
  clinicPhones(d).join(', ') || fallback

/** Trim, drop blanks and repeats (by digits). Null when something is not a phone number, or there are too many. */
export function cleanClinicPhones(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== 'string') return null
    const t = item.trim().replace(/\s+/g, ' ')
    if (!t) continue
    if (!/^\+?[\d][\d ()-]{4,19}$/.test(t)) return null
    const key = t.replace(/\D/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.length > MAX_CLINIC_PHONES ? null : out
}
