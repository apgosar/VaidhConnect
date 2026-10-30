import { message, type Lang } from './messages'
import { errorText } from './errors'

/**
 * The text to show for a failed API call, in one place so every screen says the same thing.
 * Order: a specific message the server wrote for this case, then the catalogue wording for its
 * code, then the caller's own fallback ("Could not save the notes."), then a generic line.
 *
 * Server texts written for a general problem (the catalogue's own wording) are replaced by the
 * catalogue text in the user's language, so only specific messages stay English.
 */
export function failureText(data: unknown, fallback?: string, lang: Lang = 'en'): string {
  const d = (data ?? {}) as { error?: unknown; code?: unknown }
  const fromCode = errorText(d.code, lang)
  const generic = typeof d.code === 'string' && typeof d.error === 'string' && d.error === errorText(d.code, 'en')
  if (typeof d.error === 'string' && d.error && !generic) return d.error
  return fromCode ?? fallback ?? message('error.SERVER_ERROR', lang)
}

/** Reads a failed response and returns the text to show. Never throws (an unreadable body is just "failed"). */
export async function readFailure(res: Response, fallback?: string, lang: Lang = 'en'): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return failureText(data, fallback, lang)
}

/** Text for a request that never got an answer. */
export const networkFailureText = (lang: Lang = 'en') => message('error.NETWORK', lang)
