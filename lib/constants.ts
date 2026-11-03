export const SPECIALTIES = [
  { value: 'General Physician', color: '#3B82F6', icon: '🩺' },
  { value: 'Cardiologist', color: '#EF4444', icon: '❤️' },
  { value: 'Dermatologist', color: '#14B8A6', icon: '🧴' },
  { value: 'Pediatrician', color: '#F59E0B', icon: '👶' },
  { value: 'Orthopedic', color: '#64748B', icon: '🦴' },
  { value: 'Gynecologist', color: '#EC4899', icon: '🌸' },
  { value: 'ENT', color: '#8B5CF6', icon: '👂' },
  { value: 'Dentist', color: '#06B6D4', icon: '🦷' },
  { value: 'Psychiatrist', color: '#6366F1', icon: '🧠' },
  { value: 'Ophthalmologist', color: '#10B981', icon: '👁️' },
  { value: 'Homeopathy', color: '#22C55E', icon: '🌿' },
  { value: 'Ayurvedic', color: '#F97316', icon: '🌾' },
  { value: 'Home Healthcare', color: '#0EA5E9', icon: '🏠' },
] as const

export type Specialty = typeof SPECIALTIES[number]['value']

export function getSpecialtyColor(specialty: string): string {
  return SPECIALTIES.find(s => s.value === specialty)?.color ?? '#3B82F6'
}

export function getSpecialtyIcon(specialty: string): string {
  return SPECIALTIES.find(s => s.value === specialty)?.icon ?? '🩺'
}

export const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
] as const

export type DayOfWeek = typeof DAYS_OF_WEEK[number]

export interface DayTiming {
  open: boolean
  morning?: { start: string; end: string } | null
  evening?: { start: string; end: string } | null
}

export type WeeklyTimings = Record<DayOfWeek, DayTiming>

export const DEFAULT_TIMINGS: WeeklyTimings = {
  monday:    { open: true,  morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
  tuesday:   { open: true,  morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
  wednesday: { open: true,  morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
  thursday:  { open: true,  morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
  friday:    { open: true,  morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } },
  saturday:  { open: true,  morning: { start: '09:00', end: '13:00' }, evening: null },
  sunday:    { open: false, morning: null, evening: null },
}

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'OTHER'] as const
export type PaymentMode = typeof PAYMENT_MODES[number]

/** One stage of a tapering course: this dose, this often, for this many days. */
export interface TaperStep {
  dose: string
  frequency: string
  days: number
  instructions?: string
}

export interface Medicine {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions?: string
  /** A tapering dose. When present it replaces the single dosage / frequency / duration. */
  taper?: { steps: TaperStep[] }
}

/** Advice the doctor ticks on a prescription until they write their own list in Settings. */
export const DEFAULT_ADVICE = [
  'Avoid outside food',
  'Have a fibre-rich diet',
  'Have 2 servings of fruit daily',
  'Drink plenty of water',
  'Avoid spicy and oily food',
  'Take adequate rest',
  'Walk for 30 minutes daily',
] as const
export const MAX_ADVICE_OPTIONS = 40
export const MAX_ADVICE_LENGTH = 200

/** One-tap additions next to the free-text boxes of a prescription. */
export const INVESTIGATION_CHOICES = ['CBC', 'Fasting sugar', 'PP sugar', 'HbA1c', 'Lipid profile', 'LFT', 'KFT', 'Thyroid (TSH)', 'Vitamin D3', 'Vitamin B12', 'Urine routine', 'ECG', 'X-ray chest'] as const
export const FREQUENCY_CHOICES = ['Once daily', 'Twice daily', 'Thrice daily', 'At night', 'Every 8 hours', 'When needed'] as const
export const DURATION_CHOICES = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month'] as const
export const DEFAULT_TAPER_STEP_DAYS = 5
