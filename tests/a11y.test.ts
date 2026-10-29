import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Guardrails for the accessibility basics fixed in phase 1 (docs/ACCESSIBILITY_AUDIT.md).
// They read the source, so a regression fails CI before it reaches a patient.

const root = path.resolve(__dirname, '..')
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.tsx') ? [path.join(d, e.name)] : []))
const tsx = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))]
const rel = (f: string) => path.relative(root, f).split(path.sep).join('/')
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')

const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)
  if (!m) throw new Error(`token --${name} not found`)
  return m[1]
}

describe('zoom', () => {
  it('never blocks pinch-zoom', () => {
    // comments may mention the setting; only code counts
    const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')
      .split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
    expect(layout).not.toMatch(/maximumScale\s*:/)
    expect(layout).not.toMatch(/userScalable/i)
    expect(layout).not.toMatch(/user-scalable/i)
  })
})

describe('colour contrast of the design tokens', () => {
  const linen = token('color-linen')
  const white = '#FFFFFF'
  const field = '#FFFEF9' // .form-input background

  it.each([
    ['muted text on the page background', token('color-sage'), linen, 4.5],
    ['muted text on a white card', token('color-sage'), white, 4.5],
    ['placeholder text on a field', token('color-placeholder'), field, 4.5],
    ['link text on the page background', token('color-link'), linen, 4.5],
    ['error text on the page background', token('color-danger'), linen, 4.5],
    ['delete icon on white', token('color-danger-icon'), white, 3],
    ['form control outline on a field', token('color-border-input'), field, 3],
    ['text on the WhatsApp green', token('color-on-whatsapp'), '#25D366', 4.5],
    ['button text on the gold button', token('color-forest'), token('color-gold'), 4.5],
    ['white on the green header', white, token('color-forest'), 4.5],
  ])('%s', (_name, fg, bg, min) => {
    expect(ratio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number)
  })
})

describe('forms', () => {
  it('every input, select and textarea has a programmatic name', () => {
    const unnamed: string[] = []
    for (const file of tsx) {
      const s = fs.readFileSync(file, 'utf8')
      const re = /<(input|select|textarea)\b/g
      let m: RegExpExecArray | null
      while ((m = re.exec(s))) {
        const rest = s.slice(m.index)
        const end = rest.search(/\/>|<\/(select|textarea)>/)
        const tag = rest.slice(0, end > 0 ? end : 400)
        if (/type=["'](hidden|file)["']/.test(tag)) continue
        const before = s.slice(Math.max(0, m.index - 250), m.index)
        const wrapped = /<label[^>]*>(?![\s\S]*<\/label>)/.test(before)
        if (!(/\bid=|aria-label|aria-labelledby/.test(tag) || wrapped)) unnamed.push(`${rel(file)}:${s.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(unnamed).toEqual([])
  })

  it('error paragraphs are announced to screen readers', () => {
    const silent = tsx.filter(f => /<p className="form-error">/.test(fs.readFileSync(f, 'utf8'))).map(rel)
    expect(silent).toEqual([])
  })
})

describe('text and targets', () => {
  it('uses no text smaller than 12px', () => {
    const tiny = tsx.filter(f => /text-\[(8|9|10|11)px\]|fontSize: ?(8|9|10|11)\b/.test(fs.readFileSync(f, 'utf8'))).map(rel)
    expect(tiny).toEqual([])
  })

  it('form fields are 16px so iOS does not zoom on focus, and buttons meet the minimum size', () => {
    expect(css).toMatch(/\.form-input,[\s\S]*?font-size:\s*16px/)
    expect(css).toMatch(/\.btn \{\s*min-height:\s*44px/)
  })

  it('has a visible keyboard focus style and a skip link', () => {
    expect(css).toMatch(/:focus-visible\s*\{/)
    const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')
    expect(layout).toContain('href="#main-content"')
  })

  it('every page that the skip link can land on has a main-content target', () => {
    const pages = ['app/appointments/page.tsx', 'app/book/page.tsx', 'components/patient/PatientPortal.tsx', 'components/patient/RegisterClient.tsx', 'app/doctor/login/page.tsx', 'app/admin/login/page.tsx', 'app/doctor/(protected)/layout.tsx']
    const missing = pages.filter(p => !fs.readFileSync(path.join(root, p), 'utf8').includes('id="main-content"'))
    expect(missing).toEqual([])
  })
})
