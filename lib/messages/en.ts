/**
 * Every standard user-facing message, in English. Other languages live beside this file and must
 * define the same keys (tests/messages.test.ts checks that), so adding a language never means
 * touching a page. Add a key here before using new wording in a component or an API response.
 */
export const en = {
  // Errors, keyed by the codes in lib/errors.ts
  'error.SERVER_ERROR': 'Something went wrong on our side. Please try again.',
  'error.CLINIC_NOT_FOUND': 'Clinic not found',
  'error.UNAUTHORIZED': 'Unauthorized',
  'error.FORBIDDEN': 'You do not have permission to do that',
  'error.NOT_FOUND': 'Not found',
  'error.RATE_LIMITED': 'Too many requests. Please try again later.',
  'error.VALIDATION': 'Please check the details and try again',
  'error.NETWORK': 'Could not reach the server. Check your connection and try again.',

  // Common UI wording
  'common.home': 'Home',
  'common.backToHome': 'Back to home',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading',
  'common.close': 'Close',
  'common.skipToContent': 'Skip to main content',
  'common.fileTooLarge': 'That file is too large',
} as const

export type MessageKey = keyof typeof en
