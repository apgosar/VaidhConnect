import { scriptLang } from '@/lib/messages'

/**
 * User-entered text (a patient's name, a note) that may be in Hindi or Gujarati inside an English page.
 * Tagging it with its language lets screen readers pronounce it properly and lets browsers pick the right
 * font. Plain Latin text is returned untouched, so the page language applies.
 */
export function LangText({ children }: { children: string | null | undefined }) {
  const lang = scriptLang(children)
  if (!children) return null
  return lang ? <span lang={lang}>{children}</span> : <>{children}</>
}
