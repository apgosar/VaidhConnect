import { describe, it, expect } from 'vitest'
import { createClinicSchema, patchClinicSchema } from '@/lib/adminSchemas'

describe('operator console requests', () => {
  it('lets the console flip ONE plan flag at a time', () => {
    expect(patchClinicSchema.safeParse({ features: { payments: false } }).success).toBe(true)
    expect(patchClinicSchema.safeParse({ features: { whatsapp: true, videos: false } }).success).toBe(true)
  })

  it('rejects a flag that does not exist', () => {
    expect(patchClinicSchema.safeParse({ features: { teleportation: true } }).success).toBe(false)
    expect(patchClinicSchema.safeParse({ features: { payments: 'no' } }).success).toBe(false)
  })

  it('accepts a bare status change, and nothing else is required', () => {
    expect(patchClinicSchema.safeParse({ status: 'suspended' }).success).toBe(true)
    expect(patchClinicSchema.safeParse({}).success).toBe(true)
    expect(patchClinicSchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })

  it('lowercases hostnames being added or removed', () => {
    expect(patchClinicSchema.parse({ addDomain: ' DrShah.Example.IN ' }).addDomain).toBe('drshah.example.in')
  })

  it('requires the fields needed to onboard a clinic', () => {
    const ok = { id: 'drshah', name: 'Shah Clinic', doctor: 'A Shah', email: 'a@b.in', domain: 'drshah.example.in' }
    expect(createClinicSchema.safeParse(ok).success).toBe(true)
    expect(createClinicSchema.safeParse({ ...ok, email: 'nope' }).success).toBe(false)
    expect(createClinicSchema.safeParse({ ...ok, domain: undefined }).success).toBe(false)
  })
})
