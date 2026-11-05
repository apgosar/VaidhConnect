export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const
export type Gender = typeof GENDERS[number]

export const GENDER_LABEL: Record<Gender, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }

export const isGender = (v: unknown): v is Gender => typeof v === 'string' && (GENDERS as readonly string[]).includes(v)

/** "Male" / "Female" / "Other", or '' when the record has none (older patients). */
export const genderLabel = (v: unknown): string => (isGender(v) ? GENDER_LABEL[v] : '')

/**
 * The short age and gender written beside a patient's name: "56M", "60F", "34" (no gender on record), "O" style
 * is "34O" for Other. `dob` is a date or YYYY-MM-DD; `today` is YYYY-MM-DD. Empty when neither is known.
 */
export function ageSex(dob: Date | string | null | undefined, gender: unknown, today: string): string {
  let ymd = ''
  if (dob instanceof Date) { if (!Number.isNaN(dob.getTime())) ymd = dob.toISOString().slice(0, 10) }
  else if (typeof dob === 'string') ymd = dob.slice(0, 10)
  let age = ''
  if (ymd) {
    const years = Number(today.slice(0, 4)) - Number(ymd.slice(0, 4))
    age = String(Math.max(0, today.slice(5) < ymd.slice(5) ? years - 1 : years))
  }
  const sex = isGender(gender) ? gender[0] : ''
  return `${age}${sex}`
}
