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

export async function sendWhatsAppTemplate(to: string, template: TemplateParams): Promise<boolean> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[WhatsApp] Meta Cloud API credentials not configured, skipping.')
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
      console.error('[WhatsApp] Failed to send template:', JSON.stringify(data, null, 2))
      return false
    }

    console.log('[WhatsApp] Successfully sent template:', JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.error('[WhatsApp] Network error:', error)
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
  })
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
  })
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
  })
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
  })
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
  })
}
