/**
 * The bottom bar of the public page always has five buttons: About and Book never change, and three more can be
 * chosen from the sections below. A section with nothing in it stays in the bar but cannot be tapped.
 */
export const NAV_SECTIONS = ['products', 'services', 'videos', 'payment'] as const
export type NavSection = (typeof NAV_SECTIONS)[number]
export const NAV_SLOTS = 3

export const NAV_LABEL: Record<NavSection, string> = { products: 'Products', services: 'Services', videos: 'Videos', payment: 'Payment' }
export const isNavSection = (v: unknown): v is NavSection => typeof v === 'string' && (NAV_SECTIONS as readonly string[]).includes(v)

/** The clinic's choice, tidied: only known sections, no repeats, at most three. Returns null when there is no usable choice. */
export function cleanBottomNav(raw: unknown): NavSection[] | null {
  if (!Array.isArray(raw)) return null
  const seen = [...new Set(raw.filter(isNavSection))].slice(0, NAV_SLOTS)
  return seen.length === NAV_SLOTS ? seen : null
}

/**
 * The three buttons to show, in order. The clinic's choice wins. Without one, the sections that have something in
 * them come first, then empty ones (greyed out) fill the remaining places.
 */
export function pickBottomNav(chosen: unknown, has: Record<NavSection, boolean>): { key: NavSection; enabled: boolean }[] {
  const keys = cleanBottomNav(chosen) ?? [...NAV_SECTIONS.filter(k => has[k]), ...NAV_SECTIONS.filter(k => !has[k])].slice(0, NAV_SLOTS)
  return keys.map(key => ({ key, enabled: has[key] }))
}
