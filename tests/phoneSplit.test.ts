import { describe, it, expect } from 'vitest'
import { splitPhone } from '@/lib/phoneSplit'

describe('splitPhone', () => {
  it('keeps an Indian mobile number whole after +91 (the number starts 97...)', () => {
    expect(splitPhone('+919773776803')).toEqual({ countryCode: '+91', national: '9773776803' })
    expect(splitPhone('+919876543210')).toEqual({ countryCode: '+91', national: '9876543210' })
  })

  it('does not let a number that starts like another country code change the answer', () => {
    // +91 then 98..., +91 then 97..., +91 then 44... must all stay +91
    for (const n of ['9812345678', '9712345678', '4412345678', '1112345678', '7012345678']) {
      expect(splitPhone(`+91${n}`)).toEqual({ countryCode: '+91', national: n })
    }
  })

  it('handles one, two and three digit country codes', () => {
    expect(splitPhone('+14155552671')).toEqual({ countryCode: '+1', national: '4155552671' })
    expect(splitPhone('+79161234567')).toEqual({ countryCode: '+7', national: '9161234567' })
    expect(splitPhone('+447911123456')).toEqual({ countryCode: '+44', national: '7911123456' })
    expect(splitPhone('+61412345678')).toEqual({ countryCode: '+61', national: '412345678' })
    expect(splitPhone('+8613800138000')).toEqual({ countryCode: '+86', national: '13800138000' })
    expect(splitPhone('+971501234567')).toEqual({ countryCode: '+971', national: '501234567' })
    expect(splitPhone('+353871234567')).toEqual({ countryCode: '+353', national: '871234567' })
    expect(splitPhone('+9779812345678')).toEqual({ countryCode: '+977', national: '9812345678' })
  })

  it('tolerates spaces and dashes', () => {
    expect(splitPhone('+91 97737 76803')).toEqual({ countryCode: '+91', national: '9773776803' })
    expect(splitPhone('+1-415-555-2671')).toEqual({ countryCode: '+1', national: '4155552671' })
  })

  it('never loses a digit, even for an unassigned prefix', () => {
    const r = splitPhone('+99912345678')!
    expect(r.countryCode.slice(1) + r.national).toBe('99912345678')
  })

  it('returns null for anything that is not an international number', () => {
    expect(splitPhone('9773776803')).toBeNull()
    expect(splitPhone('+12')).toBeNull()
    expect(splitPhone('')).toBeNull()
  })

  it('the code always joins back with the number to the original', () => {
    for (const p of ['+919773776803', '+14155552671', '+447911123456', '+971501234567', '+8613800138000']) {
      const s = splitPhone(p)!
      expect(s.countryCode + s.national).toBe(p)
    }
  })
})
