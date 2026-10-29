/**
 * Per-clinic theming. A clinic sets ONE primary colour (profile.theme.primary);
 * every related token is derived here, so a clinic can never end up with an
 * unreadable combination. Clinics without a theme get no overrides at all and
 * render exactly the default design system in globals.css.
 */
const HEX = /^#[0-9a-fA-F]{6}$/

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function mix(hex: string, target: number, amount: number): string {
  return '#' + channels(hex)
    .map(c => Math.round(c + (target - c) * amount).toString(16).padStart(2, '0'))
    .join('')
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** True if the colour is a plain #RRGGBB hex with enough contrast to carry white text. */
export function isUsablePrimary(primary: string): boolean {
  return HEX.test(primary) && 1.05 / (luminance(primary) + 0.05) >= 3
}

/** Returns CSS overriding the design tokens, or '' if no valid primary is set. */
export function themeCss(theme: unknown): string {
  const primary = (theme as { primary?: unknown } | null)?.primary
  // Strict validation: this string is injected into a <style> tag.
  if (typeof primary !== 'string' || !HEX.test(primary)) return ''
  // Primary is used as a background behind white text; refuse colours too
  // light to carry it (WCAG-ish: contrast vs white >= 3).
  if (1.05 / (luminance(primary) + 0.05) < 3) return ''

  const [r, g, b] = channels(primary)
  return `:root{` +
    `--color-forest:${primary};` +
    `--color-forest-dark:${mix(primary, 0, 0.3)};` +
    `--color-pine:${mix(primary, 255, 0.12)};` +
    `--color-pine-light:${mix(primary, 255, 0.25)};` +
    `--color-primary-bg:rgba(${r},${g},${b},0.06);` +
    `}`
}

export function themeColorOf(theme: unknown, fallback = '#0F3D2E'): string {
  const primary = (theme as { primary?: unknown } | null)?.primary
  return typeof primary === 'string' && HEX.test(primary) ? primary : fallback
}

/** The clinic's brand colour for emails, or undefined to keep the default. */
export function emailAccent(profile: { theme?: { primary?: unknown } } | undefined): string | undefined {
  const primary = profile?.theme?.primary
  return typeof primary === 'string' && isUsablePrimary(primary) ? primary : undefined
}
