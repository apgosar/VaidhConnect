import { describe, it, expect } from 'vitest'
import { can, forbid, PERMISSIONS, ROLES, type Permission } from '@/lib/auth/access'
import { bookingSchema, lookupSchema, normalizePhone, patientDetailsSchema } from '@/lib/validation'

describe('role permissions', () => {
  it('gives the owner everything', () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(can('OWNER', p)).toBe(true)
  })

  it('keeps front-desk staff away from clinical records, settings, the team and logs', () => {
    for (const p of ['prescriptions:manage', 'settings:manage', 'team:manage', 'logs:view', 'audit:view'] as Permission[]) {
      expect(can('STAFF', p), p).toBe(false)
    }
    for (const p of ['appointments:manage', 'patients:manage', 'blocked:manage', 'payments:manage'] as Permission[]) {
      expect(can('STAFF', p), p).toBe(true)
    }
  })

  it('lets doctors do clinical work and settings but not manage the team or read the audit log', () => {
    expect(can('DOCTOR', 'prescriptions:manage')).toBe(true)
    expect(can('DOCTOR', 'settings:manage')).toBe(true)
    expect(can('DOCTOR', 'team:manage')).toBe(false)
    expect(can('DOCTOR', 'audit:view')).toBe(false)
  })

  it('denies anyone without a role', () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(can(undefined, p)).toBe(false)
  })

  it('only knows the three roles', () => {
    expect([...ROLES]).toEqual(['OWNER', 'DOCTOR', 'STAFF'])
  })

  it('forbid() returns a 403 response, or null when allowed', async () => {
    expect(forbid({ role: 'OWNER' }, 'team:manage')).toBeNull()
    const denied = forbid({ role: 'STAFF' }, 'team:manage')!
    expect(denied.status).toBe(403)
    expect(forbid(null, 'patients:manage')!.status).toBe(403)
  })
})

describe('input validation', () => {
  it('normalises phone numbers and treats a bare 10-digit number as Indian', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210')
    expect(normalizePhone('+91 (98765) 43-210')).toBe('+919876543210')
    expect(normalizePhone('+971501234567')).toBe('+971501234567')
  })

  const patient = { name: 'Asha Rao', phone: '9876543210', dob: '1990-05-01' }
  const slot = { startTime: '2026-11-02T03:30:00.000Z', endTime: '2026-11-02T04:00:00.000Z' }

  it('accepts a valid public booking and normalises the phone', () => {
    const r = bookingSchema.parse({ patient, ...slot })
    expect(r.patient!.phone).toBe('+919876543210')
  })

  it('requires exactly one of patient details or a patientId', () => {
    expect(bookingSchema.safeParse({ ...slot }).success).toBe(false)
    expect(bookingSchema.safeParse({ patient, patientId: 'p1', ...slot }).success).toBe(false)
    expect(bookingSchema.safeParse({ patientId: 'p1', ...slot }).success).toBe(true)
  })

  it.each([
    ['an impossible date of birth', { dob: '1990-02-31' }],
    ['a future date of birth', { dob: '2999-01-01' }],
    ['a one-letter name', { name: 'A' }],
    ['a phone number that is too short', { phone: '12345' }],
    ['a phone number with letters', { phone: 'call me maybe' }],
    ['a malformed email', { email: 'not-an-email' }],
    ['an oversized medical history', { medicalHistory: 'x'.repeat(2001) }],
  ])('rejects %s', (_l, over) => {
    expect(patientDetailsSchema.safeParse({ ...patient, ...over }).success).toBe(false)
  })

  it('rejects malformed times and an oversized complaint', () => {
    expect(bookingSchema.safeParse({ patient, startTime: 'tomorrow', endTime: slot.endTime }).success).toBe(false)
    expect(bookingSchema.safeParse({ patient, ...slot, chiefComplaint: 'x'.repeat(501) }).success).toBe(false)
  })

  it('caps how many appointments one lookup may ask about', () => {
    const item = { id: 'a', token: 't'.repeat(43) }
    expect(lookupSchema.safeParse({ items: Array(20).fill(item) }).success).toBe(true)
    expect(lookupSchema.safeParse({ items: Array(21).fill(item) }).success).toBe(false)
    expect(lookupSchema.safeParse({ items: [] }).success).toBe(false)
  })
})
