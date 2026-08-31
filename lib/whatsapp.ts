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
    parameters: Array<{
      type: 'text';
      text: string;
    }>;
  }>;
}

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
      return `Hi ${params[0] || 'Patient'}, your appointment with ${params[1] || 'Doctor'} is confirmed for ${params[2] || 'Scheduled Time'}. For any queries or assistance, contact ${params[3] || 'Clinic'}.`
    case 'appt_cancellation':
      return `Hi ${params[0] || 'Patient'}, your appointment scheduled for ${params[1] || 'Scheduled Time'} has been cancelled. For queries, contact ${params[2] || 'Clinic'}.`
    case 'appt_reminder':
      return `Appointment Reminder: Hi ${params[0] || 'Patient'}, this is a reminder for your appointment with ${params[1] || 'Doctor'} on ${params[2] || 'Scheduled Time'}.${params[4] ? ` Directions: ${params[4]}.` : ''} Clinic Contact: ${params[3] || 'Clinic'}.`
    case 'daily_summary_morning':
      return `Good Morning Dr. ${params[0] || 'Doctor'}, here is your schedule for today (${params[2] || 'Today'}). You have ${params[1] || '0'} appointment(s):\n\n${params[3] || 'No appointments'}`
    case 'daily_summary_update':
      return `Schedule Update for Dr. ${params[0] || 'Doctor'}:\nChange: ${params[1] || 'Update'}\nRemaining appointments today: ${params[2] || '0'}\n\nUpdated Schedule:\n${params[3] || 'No appointments'}`
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
    const { adminDb } = await import('@/lib/firebase/server')
    await adminDb.collection('whatsapp_logs').add({
      ...entry,
      sentAt: new Date(),
    })
  } catch (err) {
    // Never let logging failures affect the main flow
    console.error('[WhatsApp][Log] Failed to write log:', err)
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  template: TemplateParams,
  options?: SendOptions
): Promise<boolean> {
  const templateName = template.name
  const messageType = options?.messageType ?? templateName
  const recipientName = options?.recipientName ?? ''
  const params = template.components
    .flatMap(c => c.parameters)
    .map(p => p.text)
  const messageBody = options?.messageBody ?? constructMessageBody(templateName, params)

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
    return false
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
        template: template
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
      return false
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
    return true
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
    return false
  }
}

// 1. Booking Confirmation (`appt_booking_confirmation`)
export async function sendBookingConfirmation(to: string, params: {
  patientName: string;
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
        { type: 'text', text: params.doctorName },
        { type: 'text', text: params.appointmentTime },
        { type: 'text', text: params.clinicPhone },
      ]
    }]
  }, { messageType: 'Booking Confirmation', recipientName: params.patientName })
}

// 2. Cancellation Notification (`appt_cancellation`)
export async function sendCancellation(to: string, params: {
  patientName: string;
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
        { type: 'text', text: params.appointmentTime },
        { type: 'text', text: params.clinicPhone },
      ]
    }]
  }, { messageType: 'Cancellation', recipientName: params.patientName })
}

// 3. Appointment Reminder (`appt_reminder`)
export async function sendReminder(to: string, params: {
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
        { type: 'text', text: params.patientName },
        { type: 'text', text: params.doctorName },
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
  appointmentCount: string;
  date: string;
  scheduleList: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'daily_summary_morning',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: params.doctorName },
        { type: 'text', text: params.appointmentCount },
        { type: 'text', text: params.date },
        { type: 'text', text: params.scheduleList },
      ]
    }]
  }, { messageType: 'Daily Summary (Morning)', recipientName: params.doctorName })
}

// 5. Updated Summary for Doctor (`daily_summary_update`)
export async function sendSummaryUpdate(to: string, params: {
  doctorName: string;
  cancelledPatientName: string;
  remainingCount: string;
  scheduleList: string;
}) {
  return sendWhatsAppTemplate(to, {
    name: 'daily_summary_update',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: params.doctorName },
        { type: 'text', text: params.cancelledPatientName },
        { type: 'text', text: params.remainingCount },
        { type: 'text', text: params.scheduleList },
      ]
    }]
  }, { messageType: 'Daily Summary (Update)', recipientName: params.doctorName })
}
