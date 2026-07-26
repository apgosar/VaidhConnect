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

export interface Medicine {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions?: string
}
