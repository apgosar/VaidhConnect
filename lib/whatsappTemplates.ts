/**
 * Gupshup template IDs, keyed by the template name used in the code.
 * These are identifiers, not secrets. Verify with `npx tsx scripts/check-gupshup-templates.ts`.
 */
export const GUPSHUP_TEMPLATE_IDS: Record<string, string> = {
  appt_booking_confirmation: 'cbe11a16-8954-491a-8315-f3b8cf837836',
  appt_cancellation: '0afe7ff3-950f-498d-bba2-f5583f157106',
  appt_reminder: 'cf738a30-934d-48de-867e-93b612e9da70',
  appt_rescheduled: '8f46f9d0-4203-40e8-b994-33eb25a9f081',
  daily_summary_morning: 'b16492ca-2f5a-46b4-8509-f80e51472271',
  daily_summary_update: '58570059-19b7-402e-aa5d-82ba2aaf3d3f',
  prescription_share: 'c3add336-7d22-4b8d-b813-7e29c682cfdf',
  followup_reminder: '1127753f-4925-48ba-912a-8d1e4dc04556',
  patient_pin_reset: '8935045b-3841-4e2f-b0a0-b83280e01716',
}

/** How many variables each template expects (body variables, plus the button code for the PIN template). */
export const GUPSHUP_TEMPLATE_PARAM_COUNTS: Record<string, number> = {
  appt_booking_confirmation: 5,
  appt_cancellation: 4,
  appt_reminder: 6,
  appt_rescheduled: 5,
  daily_summary_morning: 5,
  daily_summary_update: 5,
  prescription_share: 4,
  followup_reminder: 6,
  patient_pin_reset: 2,
}

/** Gupshup's numeric error codes, in words a clinic can act on. */
export function gupshupErrorMessage(code: string | number | undefined, fallback: string): string {
  switch (String(code)) {
    case '1002': return 'That number is not on WhatsApp'
    case '1003': return 'The WhatsApp sending balance is empty. Please top up the Gupshup wallet'
    case '1004': case '1005': case '1006': case '1007': return 'The WhatsApp template is not available. Please contact support'
    case '1008': return 'The recipient has not opted in to WhatsApp messages'
    case '1009': return 'A required template value was missing'
    case '1010': return 'The attached document could not be fetched'
    case '1011': return 'The attached document is too large'
    case '1012': return 'The recipient has opted out of WhatsApp messages'
    case '4001': return 'Too many messages were sent at once. Please try again shortly'
    case '4003': return 'The message did not match the approved template'
    case '4005': return 'The WhatsApp template is paused'
    default: return fallback
  }
}
