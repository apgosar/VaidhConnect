import { message, type Lang } from './messages'

/**
 * The standard error vocabulary of the API. Every route answers a failure with apiError(code), so the
 * same problem always has the same status, wording and machine-readable `code`; the client turns the
 * code into the right wording (and language) instead of printing whatever string the server wrote.
 *
 * The response keeps the long-standing { error: string } shape and adds { code }, so nothing that
 * already reads `error` changes.
 */
export const ERROR_STATUS = {
  SERVER_ERROR: 500,
  CLINIC_NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  VALIDATION: 400,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export interface ApiErrorOptions {
  /** Specific wording for this case (a validation message, a PIN hint). Defaults to the catalogue text. */
  message?: string
  status?: number
  /** Extra fields, e.g. retryAfter. */
  extra?: Record<string, unknown>
}

export function apiError(code: ErrorCode, options: ApiErrorOptions = {}): Response {
  return Response.json(
    { error: options.message ?? message(`error.${code}`), code, ...options.extra },
    { status: options.status ?? ERROR_STATUS[code] },
  )
}

/** The catalogue wording for an error code in a language; undefined when the code is not one of ours. */
export function errorText(code: unknown, lang: Lang = 'en'): string | undefined {
  return typeof code === 'string' && code in ERROR_STATUS ? message(`error.${code as ErrorCode}`, lang) : undefined
}
