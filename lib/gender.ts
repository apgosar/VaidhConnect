export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const
export type Gender = typeof GENDERS[number]

export const GENDER_LABEL: Record<Gender, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }

export const isGender = (v: unknown): v is Gender => typeof v === 'string' && (GENDERS as readonly string[]).includes(v)

/** "Male" / "Female" / "Other", or '' when the record has none (older patients). */
export const genderLabel = (v: unknown): string => (isGender(v) ? GENDER_LABEL[v] : '')
