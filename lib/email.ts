import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface EmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'Clinic App <noreply@clinic.app>',
      ...options,
    })
    return true
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return false
  }
}

export function appointmentReminderHtml({
  patientName,
  doctorName,
  clinicName,
  appointmentTime,
  clinicPhone,
  clinicAddress,
}: {
  patientName: string
  doctorName: string
  clinicName: string
  appointmentTime: string
  clinicPhone?: string
  clinicAddress?: string
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #3B82F6; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Appointment Reminder</h1>
        <p style="margin: 4px 0 0; opacity: 0.9;">${clinicName}</p>
      </div>
      <div style="padding: 24px; background: #f9fafb; border-radius: 0 0 8px 8px;">
        <p>Dear <strong>${patientName}</strong>,</p>
        <p>This is a reminder for your upcoming appointment:</p>
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Doctor:</strong> Dr. ${doctorName}</p>
          <p style="margin: 8px 0 0;"><strong>Date & Time:</strong> ${appointmentTime}</p>
          ${clinicAddress ? `<p style="margin: 8px 0 0;"><strong>Address:</strong> ${clinicAddress}</p>` : ''}
          ${clinicPhone ? `<p style="margin: 8px 0 0;"><strong>Phone:</strong> ${clinicPhone}</p>` : ''}
        </div>
        <p style="color: #6b7280; font-size: 14px;">Please arrive 10 minutes early. To cancel, contact us at the number above.</p>
      </div>
    </div>
  `
}

export function passwordResetHtml(resetUrl: string, doctorName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #3B82F6; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Password Reset</h1>
      </div>
      <div style="padding: 24px; background: #f9fafb; border-radius: 0 0 8px 8px;">
        <p>Dear Dr. ${doctorName},</p>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Reset Password</a>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
      </div>
    </div>
  `
}
