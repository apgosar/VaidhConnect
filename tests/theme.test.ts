import { describe, it, expect } from 'vitest'
import { themeCss, themeColorOf, isUsablePrimary } from '@/lib/tenant/theme'
import { hasFeature } from '@/lib/tenant/features'

describe('themeCss', () => {
  it('emits nothing when a clinic has no theme (default look unchanged)', () => {
    expect(themeCss(undefined)).toBe('')
    expect(themeCss({})).toBe('')
  })

  it('derives tokens from a valid primary colour', () => {
    const css = themeCss({ primary: '#0B6E4F' })
    expect(css).toContain('--color-forest:#0B6E4F')
    expect(css).toContain('--color-primary-bg:rgba(11,110,79,0.06)')
  })

  it('rejects anything that could break out of the style tag', () => {
    expect(themeCss({ primary: '#000000;}</style><script>alert(1)</script>' })).toBe('')
    expect(themeCss({ primary: 'red' })).toBe('')
    expect(themeCss({ primary: '#fff' })).toBe('')
  })

  it('rejects colours too light to carry white text', () => {
    expect(themeCss({ primary: '#FFFF00' })).toBe('')
    expect(themeCss({ primary: '#F5F5F5' })).toBe('')
  })

  it('requires AA contrast for white text AND for the colour used as text on the cream page', () => {
    // #2E8B57 (sea green) passes the old 3:1 rule but would read as 4.1:1 text on the page background
    expect(isUsablePrimary('#2E8B57')).toBe(false)
    expect(themeCss({ primary: '#2E8B57' })).toBe('')
    for (const ok of ['#0F3D2E', '#0B6E4F', '#1E3A8A', '#7A1F1F']) {
      expect(isUsablePrimary(ok), ok).toBe(true)
      expect(themeCss({ primary: ok })).toContain(`--color-forest:${ok}`)
    }
  })

  it('falls back for the browser theme colour', () => {
    expect(themeColorOf({ primary: '#0B6E4F' })).toBe('#0B6E4F')
    expect(themeColorOf({ primary: 'nope' })).toBe('#0F3D2E')
  })
})

describe('feature flags', () => {
  it('defaults every feature on so existing clinics keep what they have', () => {
    expect(hasFeature(undefined, 'prescriptions')).toBe(true)
    expect(hasFeature({}, 'payments')).toBe(true)
    expect(hasFeature({ features: {} }, 'payments')).toBe(true)
  })

  it('turns a feature off only when explicitly false', () => {
    expect(hasFeature({ features: { payments: false } }, 'payments')).toBe(false)
    expect(hasFeature({ features: { payments: false } }, 'prescriptions')).toBe(true)
  })
})
