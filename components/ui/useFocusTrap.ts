'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * For anything that sits on top of the page (dialogs, the mobile menu) so it behaves for keyboard and
 * screen-reader users: focus moves inside when it opens, Tab and Shift+Tab stay inside, Escape closes
 * it, the page behind does not scroll, and focus goes back to what opened it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return
    const opener = document.activeElement as HTMLElement | null
    // Visible by style rather than by layout, so hidden controls are skipped (and it behaves the same in tests).
    const visible = (el: HTMLElement) => { const st = getComputedStyle(el); return !el.hidden && st.display !== 'none' && st.visibility !== 'hidden' }
    const items = () => [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible)

    const first = initialFocus?.current ?? items()[0] ?? container
    first.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onEscape(); return }
      if (e.key !== 'Tab') return
      const list = items()
      if (list.length === 0) { e.preventDefault(); return }
      const firstEl = list[0], lastEl = list[list.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      else if (!container.contains(document.activeElement)) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
    // onEscape is intentionally not a dependency: callers pass a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref])
}
