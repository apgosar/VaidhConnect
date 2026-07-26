import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[WhatsApp] Twilio credentials not configured, skipping.')
    return false
  }

  // Normalize phone number to E.164 format
  const normalized = to.startsWith('+') ? to : `+${to}`

  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
      to: `whatsapp:${normalized}`,
      body,
    })
    return true
  } catch (error) {
    console.error('[WhatsApp] Failed to send:', error)
    return false
  }
}

export function appointmentReminderMessage({
  patientName,
  doctorName,
  clinicName,
  appointmentTime,
  clinicPhone,
}: {
  patientName: string
  doctorName: string
  clinicName: string
  appointmentTime: string
  clinicPhone?: string
}): string {
  return `🏥 *${clinicName}*\n\nHello ${patientName}, this is a reminder for your appointment:\n\n👨‍⚕️ *Doctor:* Dr. ${doctorName}\n📅 *Date & Time:* ${appointmentTime}\n${clinicPhone ? `📞 *Contact:* ${clinicPhone}` : ''}\n\nPlease arrive 10 minutes early. Reply to this message or call us to cancel.`
}
