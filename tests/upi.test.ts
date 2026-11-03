import { describe, it, expect } from 'vitest'
import { upiPayLink, isUpiId } from '@/lib/upi'

describe('upiPayLink', () => {
  it('opens a UPI app with the payee filled in', () => {
    expect(upiPayLink('drshah@okhdfcbank', 'Shah Family Clinic')).toBe('upi://pay?pa=drshah%40okhdfcbank&pn=Shah%20Family%20Clinic&cu=INR')
  })
  it('trims the ID and falls back to a name', () => {
    expect(upiPayLink(' 9876543210@ybl ', '')).toBe('upi://pay?pa=9876543210%40ybl&pn=Clinic&cu=INR')
  })
  it('gives no link for something that is not a UPI ID', () => {
    for (const bad of ['', undefined, null, 'no-at-sign', 'a@b', 'x y@bank', 'a@bank&am=1']) expect(upiPayLink(bad as any, 'C')).toBeNull()
    expect(isUpiId('doctor@upi')).toBe(true)
  })
  it('keeps a clinic name with symbols from breaking the link', () => {
    expect(upiPayLink('dr@upi', 'A&B Clinic')).toContain('pn=A%26B%20Clinic')
  })
})
