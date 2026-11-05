import { describe, it, expect } from 'vitest'
import { ageSex } from '@/lib/gender'
import { nameWithAgeSex } from '@/lib/modules/patientLabel'

describe('age and gender beside a name', () => {
  it('writes 56M and 60F', () => {
    expect(ageSex('1970-01-01', 'MALE', '2026-11-05')).toBe('56M')
    expect(ageSex(new Date('1966-03-10T00:00:00Z'), 'FEMALE', '2026-11-05')).toBe('60F')
  })
  it('handles a birthday not reached yet, a missing gender and a missing date of birth', () => {
    expect(ageSex('1970-12-01', 'MALE', '2026-11-05')).toBe('55M')
    expect(ageSex('1970-01-01', undefined, '2026-11-05')).toBe('56')
    expect(ageSex(undefined, 'FEMALE', '2026-11-05')).toBe('F')
    expect(ageSex(undefined, undefined, '2026-11-05')).toBe('')
  })
  it('labels a patient record for the doctor schedule', () => {
    const dob = { toDate: () => new Date('1970-01-01T00:00:00Z') }
    expect(nameWithAgeSex({ name: 'Ravi', dob, gender: 'MALE' }, '2026-11-05')).toBe('Ravi 56M')
    expect(nameWithAgeSex({ name: 'Asha' }, '2026-11-05')).toBe('Asha')
    expect(nameWithAgeSex(undefined, '2026-11-05')).toBe('Unknown')
  })
})
