import { en, type MessageKey } from './en'
import { hi } from './hi'
import { gu } from './gu'

export type Lang = 'en' | 'hi' | 'gu'
export type { MessageKey }

export const LANGS: readonly Lang[] = ['en', 'hi', 'gu']
const catalogues: Record<Lang, Record<MessageKey, string>> = { en, hi, gu }

/** The wording for a key in a language; falls back to English, never to a blank. */
export function message(key: MessageKey, lang: Lang = 'en'): string {
  return catalogues[lang]?.[key] ?? en[key]
}

/**
 * The language a piece of text is written in, judged by its script, for the `lang` attribute
 * (screen readers pronounce Gujarati and Hindi names correctly only when told which they are).
 * Returns undefined for plain Latin text so the page language applies.
 */
export function scriptLang(text: string | null | undefined): 'hi' | 'gu' | undefined {
  if (!text) return undefined
  if (/[઀-૿]/.test(text)) return 'gu'
  if (/[ऀ-ॿ]/.test(text)) return 'hi'
  return undefined
}
