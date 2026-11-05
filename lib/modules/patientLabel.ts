import { ageSex } from '../gender'

/** "Asha 56F" for the doctor's WhatsApp schedule lists; just the name when the record has no age or gender. */
export function nameWithAgeSex(p: { name?: string; dob?: { toDate(): Date } | Date | null; gender?: unknown } | undefined, today: string): string {
  const name = p?.name || 'Unknown'
  const dob = p?.dob && typeof (p.dob as any).toDate === 'function' ? (p.dob as { toDate(): Date }).toDate() : (p?.dob as Date | null | undefined)
  const tag = ageSex(dob, p?.gender, today)
  return tag ? `${name} ${tag}` : name
}
