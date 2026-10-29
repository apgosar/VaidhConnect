// WhatsApp Cloud API Integration

const API_VERSION = 'v19.0'
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

interface TemplateParams {
  name: string;
  language: {
    code: string;
  };
  components: Array<{
    type: 'body' | 'header' | 'button';
    /** Buttons only: Meta requires the kind and position of the button. */
    sub_type?: 'url';
    index?: string;
    parameters: TemplateParam[];
  }>;
}

type TemplateParam =
  | { type: 'text'; text: string }
  // A header that carries a file. Meta downloads it from `link` when it sends the message.
  | { type: 'document'; document: { link: string; filename: string } }

interface SendOptions {
  /** Human-readable label shown in the WhatsApp logs UI */
  messageType: string
  /** Patient or recipient display name for the log */
  recipientName?: string
  /** Custom reconstructed message body */
  messageBody?: string
}

export function constructMessageBody(templateName: string, params: string[]): string {
  switch (templateName) {
    case 'appt_booking_confirmation':
      return `Hi ${params[0] || 'Patient'}, your appointment at ${params[1] || 'the clinic'} with Dr. ${params[2] || 'Doctor'} has been confirmed for ${params[3] || 'Scheduled Time'}. If you have any questions or need to change your booking, please call the clinic on ${params[4] || 'the clinic'}. We look forward to seeing you.`
    case 'appt_cancellation':
      return `Hi ${params[0] || 'Patient'}, your appointment at ${params[1] || 'the clinic'} scheduled for ${params[2] || 'Scheduled Time'} has been cancelled. If you would like to book again or have any questions, please call the clinic on ${params[3] || 'the clinic'}. Thank you.`
    case 'appt_reminder':
      return `Appointment reminder from ${params[0] || 'the clinic'}: Hi ${params[1] || 'Patient'}, this is a reminder for your appointment with Dr. ${params[2] || 'Doctor'} on ${params[3] || 'Scheduled Time'}. Clinic contact: ${params[4] || 'the clinic'}. Directions: ${params[5] || 'Contact clinic for directions'}. See you soon.`
    case 'daily_summary_morning':
      return `Good morning Dr. ${params[0] || 'Doctor'}. Here is the schedule for ${params[1] || 'the clinic'} on ${params[2] || 'Today'}. You have ${params[3] || '0'} appointment(s): ${params[4] || 'No appointments'}. Have a great day.`
    case 'daily_summary_update':
      return `Schedule update for Dr. ${params[0] || 'Doctor'} at ${params[1] || 'the clinic'}: ${params[2] || 'Update'}. Total appointments today: ${params[3] || '0'}. Updated schedule: ${params[4] || 'No appointments'}. Thank you.`
    case 'prescription_share':
      return `Hi ${params[0] || 'Patient'}, here is your prescription from ${params[1] || 'the clinic'} for your visit on ${params[2] || 'your visit date'}. Please follow the doctor's advice, and call the clinic on ${params[3] || 'the clinic'} if you have any questions. Wishing you good health. [Prescription PDF attached]`
    case 'followup_reminder':
      return `Hi ${params[0] || 'Patient'}, this is a gentle reminder from ${params[1] || 'the clinic'} that your follow-up visit with Dr. ${params[2] || 'Doctor'} is due on ${params[3] || 'the planned date'}. To book your appointment, please call the clinic on ${params[4] || 'the clinic'} or visit ${params[5] || 'our website'}. We hope you are feeling better.`
    case 'patient_pin_reset':
      return `${params[0] || '000000'} is your code to reset your appointment PIN. Do not share this code with anyone. It expires in 10 minutes.`
    default:
      return params.length > 0 ? params.join('\n') : templateName
  }
}

async function logWhatsAppMessage(entry: {
  to: string
  templateName: string
  messageType: string
  recipientName: string
  params: string[]
  messageBody: string
  status: 'sent' | 'failed'
  errorDetail?: string
}) {
  try {
    // Lazy-import to avoid bundling server-only firebase-admin in edge contexts
    const { getTenant } = await import('@/lib/tenant/resolve')
    const { tenantDb } = await import('@/lib/db/tenant')
    const tenant = await getTenant()
    if (!tenant) throw new Error('no tenant in request scope')
    await tenantDb(tenant).col('whatsapp_logs').add({
      ...entry,
      sentAt: new Date(),
    })
  } catch (err) {
    // Never let logging failures affect the main flow
    console.error('[WhatsApp][Log] Failed to write log:', err)
  }
}

// Meta rejects template params containing newlines/tabs or runs of 4+
// spaces (error 132018: "Param text cannot have new-line/tab characters
// or more than 4 consecutive spaces"). Multi-line values built internally
// (e.g. a schedule list joined with '\n') are flattened to a single
// readable line instead of failing the send.
function sanitizeTemplateParamText(text: string): string {
  return text
    .replace(/\r\n|\r|\n|\t/g, ' | ')
    .replace(/ {4,}/g, '   ')
}

// The templates already say "Dr. {{n}}", so a stored name like "Dr. Mehta" must not become "Dr. Dr. Mehta".
const bareDoctorName = (name: string) => name.replace(/^\s*dr\.?\s+/i, '').trim() || name

export interface SendResult {
  ok: boolean
  /** Why it failed, in words a clinic can act on. Absent on success. */
  error?: string
}

export async function sendWhatsAppTemplate(
  to: string,
  template: TemplateParams,
  options?: SendOptions
): Promise<boolean> {
  return (await sendWhatsAppTemplateDetailed(to, template, options)).ok
}

export async function sendWhatsAppTemplateDetailed(
  to: string,
  template: TemplateParams,
  options?: SendOptions
): Promise<SendResult> {
  const sanitizedTemplate: TemplateParams = {
    ...template,
    components: template.components.map(c => ({
      ...c,
      parameters: c.parameters.map(p => (p.type === 'text' ? { ...p, text: sanitizeTemplateParamText(p.text) } : p)),
    })),
  }
  const templateName = sanitizedTemplate.name
  const messageType = options?.messageType ?? templateName
  const recipientName = options?.recipientName ?? ''
  const params = sanitizedTemplate.components
    .flatMap(c => c.parameters)
    .flatMap(p => (p.type === 'text' ? [p.text] : []))
  const messageBody = options?.messageBody ?? constructMessageBody(templateName, params)

  // Plan flag: a clinic without WhatsApp simply doesn't send (and it's logged,
  // so the clinic can see why nothing went out).
  {
    const { getTenant } = await import('@/lib/tenant/resolve')
    const { tenantHasFeature } = await import('@/lib/tenant/features')
    const tenant = await getTenant()
    if (tenant && !tenantHasFeature(tenant, 'whatsapp')) {
      await logWhatsAppMessage({
        to, templateName, messageType, recipientName, params, messageBody,
        status: 'failed', errorDetail: 'WhatsApp messaging is not enabled for this clinic',
      })
      return { ok: false, error: 'WhatsApp messaging is not enabled for this clinic' }
    }
  }

  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[WhatsApp] Meta Cloud API credentials not configured, skipping.')
    await logWhatsAppMessage({
      to,
      templateName,
      messageType,
      recipientName,
      params,
      messageBody,
      status: 'failed',
      errorDetail: 'WhatsApp credentials not configured',
    })
    return { ok: false, error: 'WhatsApp is not set up for this service yet' }
  }

  // Normalize phone number to E.164 format without '+' for WhatsApp API
  const normalized = to.replace('+', '')

  try {
    const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'template',
        template: sanitizedTemplate
      })
    })

    const data = await response.json()

    if (!response.ok) {
      const errorDetail = JSON.stringify(data)
      console.error('[WhatsApp] Failed to send template:', errorDetail)
      await logWhatsAppMessage({
        to,
        templateName,
        messageType,
        recipientName,
        params,
        messageBody,
        status: 'failed',
        errorDetail
      })
      return { ok: false, error: (data?.error?.message as string | undefined) ?? 'WhatsApp did not accept the message' }
    }

    console.log('[WhatsApp] Successfully sent template:', JSON.stringify(data, null, 2))
    await logWhatsAppMessage({
      to,
      templateName,
      messageType,
      recipientName,
      params,
      messageBody,
      status: 'sent'
    })
    return { ok: true }
  } catch (error) {
    console.error('[WhatsApp] Network error:', error)
    await logWhatsAppMessage({
      to,
      templateName,
      messageType,
      recipientName,
      params,
      messageBody,
      status: 'failed',
      errorDetail: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'Could not reach WhatsApp. Please try again.' }
  }
}

// 1. Booking Confirmation (`appt_booking_confirmation`)
export async function sendBookingConfirmation(to: string, params: {
  patientName: string;
  clinicName: string;
  doctorName: string;
  appointmentTime: string;
  clinicPhone: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'appt_booking_confirmation',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: params.patientName },
        { type: 'text', text: params.clinicName },
        { type: 'text', text: bareDoctorName(params.doctorName) },
        { type: 'text', text: params.appointmentTime },
        { type: 'text', text: params.clinicPhone },
      ]
    }]
  }, { messageType: 'Booking Confirmation', recipientName: params.patientName })
}

// 2. Cancellation Notification (`appt_cancellation`)
export async function sendCancellation(to: string, params: {
  patientName: string;
  clinicName: string;
  appointmentTime: string;
  clinicPhone: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'appt_cancellation',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: params.patientName },
        { type: 'text', text: params.clinicName },
        { type: 'text', text: params.appointmentTime },
        { type: 'text', text: params.clinicPhone },
      ]
    }]
  }, { messageType: 'Cancellation', recipientName: params.patientName })
}

// 3. Appointment Reminder (`appt_reminder`)
export async function sendReminder(to: string, params: {
  clinicName: string;
  patientName: string;
  doctorName: string;
  appointmentTime: string;
  clinicPhone: string;
  directionsUrl: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'appt_reminder',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: params.clinicName },
        { type: 'text', text: params.patientName },
        { type: 'text', text: bareDoctorName(params.doctorName) },
        { type: 'text', text: params.appointmentTime },
        { type: 'text', text: params.clinicPhone },
        { type: 'text', text: params.directionsUrl },
      ]
    }]
  }, { messageType: 'Appointment Reminder', recipientName: params.patientName })
}

// 4. Morning Summary for Doctor (`daily_summary_morning`)
export async function sendDailySummary(to: string, params: {
  doctorName: string;
  clinicName: string;
  date: string;
  appointmentCount: string;
  scheduleList: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'daily_summary_morning',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: bareDoctorName(params.doctorName) },
        { type: 'text', text: params.clinicName },
        { type: 'text', text: params.date },
        { type: 'text', text: params.appointmentCount },
        { type: 'text', text: params.scheduleList },
      ]
    }]
  }, { messageType: 'Daily Summary (Morning)', recipientName: params.doctorName })
}

// 5. Updated Summary for Doctor (`daily_summary_update`)
export async function sendSummaryUpdate(to: string, params: {
  doctorName: string;
  clinicName: string;
  /** What changed, as a short phrase, e.g. "New booking by Asha Rao for 10:30 AM". */
  change: string;
  totalCount: string;
  scheduleList: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'daily_summary_update',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: bareDoctorName(params.doctorName) },
        { type: 'text', text: params.clinicName },
        { type: 'text', text: params.change },
        { type: 'text', text: params.totalCount },
        { type: 'text', text: params.scheduleList },
      ]
    }]
  }, { messageType: 'Daily Summary (Update)', recipientName: params.doctorName })
}

// 6. PIN reset code (`patient_pin_reset`) — Meta template, one body variable (the
// code). Sent to the patient's own WhatsApp number, which is what proves they
// own it. Must be pre-approved in Meta Business Manager with exactly this name.
export async function sendPinResetCode(to: string, params: { code: string }) {
  return sendWhatsAppTemplate(to, {
    name: 'patient_pin_reset',
    language: { code: 'en' },
    // Authentication templates carry a "copy code" button, and Meta requires the
    // code again as that button's parameter (error 131008 otherwise).
    components: [
      { type: 'body', parameters: [{ type: 'text', text: params.code }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: params.code }] },
    ]
  }, { messageType: 'PIN Reset Code', recipientName: 'Patient' })
}

// 7. Prescription (`prescription_share`) — Meta template with a DOCUMENT header (the PDF) and four
// body variables. `pdfUrl` must be an https link Meta can fetch (a short-lived signed storage URL).
export async function sendPrescription(to: string, params: {
  patientName: string
  clinicName: string
  visitDate: string
  clinicPhone: string
  pdfUrl: string
  filename: string
}): Promise<SendResult> {
  return sendWhatsAppTemplateDetailed(to, {
    name: 'prescription_share',
    language: { code: 'en' },
    components: [
      { type: 'header', parameters: [{ type: 'document', document: { link: params.pdfUrl, filename: params.filename } }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.patientName },
          { type: 'text', text: params.clinicName },
          { type: 'text', text: params.visitDate },
          { type: 'text', text: params.clinicPhone },
        ],
      },
    ],
  }, { messageType: 'Prescription', recipientName: params.patientName })
}

// 8. Follow-up reminder (`followup_reminder`) — body-only template, six variables, sent the day before
// the follow-up date the doctor set on the prescription.
export async function sendFollowUpReminder(to: string, params: {
  patientName: string
  clinicName: string
  doctorName: string
  dateText: string
  clinicPhone: string
  bookingUrl: string
}): Promise<boolean> {
  return sendWhatsAppTemplate(to, {
    name: 'followup_reminder',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: params.patientName },
        { type: 'text', text: params.clinicName },
        { type: 'text', text: bareDoctorName(params.doctorName) },
        { type: 'text', text: params.dateText },
        { type: 'text', text: params.clinicPhone },
        { type: 'text', text: params.bookingUrl },
      ],
    }],
  }, { messageType: 'Follow-up Reminder', recipientName: params.patientName })
}
