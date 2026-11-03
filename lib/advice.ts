import { DEFAULT_ADVICE, MAX_ADVICE_LENGTH, MAX_ADVICE_OPTIONS } from './constants'

/** Trim, drop blanks and repeats (ignoring case). Null when it is not a list of short enough strings. */
export function cleanAdviceOptions(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== 'string') return null
    const t = item.trim().replace(/\s+/g, ' ')
    if (!t) continue
    if (t.length > MAX_ADVICE_LENGTH) return null
    if (seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out.length > MAX_ADVICE_OPTIONS ? null : out
}

/** The clinic's own list when it has made one (even an empty one), otherwise the starter list. */
export const adviceOptionsOrDefault = (saved: unknown): string[] =>
  Array.isArray(saved) ? saved.filter((a): a is string => typeof a === 'string') : [...DEFAULT_ADVICE]
