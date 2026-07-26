import { prisma } from '@/lib/prisma'
import { sendEmail, passwordResetHtml } from '@/lib/email'
import { randomBytes } from 'crypto'
import { addHours } from 'date-fns'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 })
    }

    const doctor = await prisma.doctor.findUnique({ where: { email } })

    // Always return success to avoid email enumeration
    if (!doctor) {
      return Response.json({ message: 'If that email exists, a reset link has been sent.' })
    }

    // Invalidate existing tokens
    await prisma.passwordResetToken.updateMany({
      where: { doctorId: doctor.id, used: false },
      data: { used: true },
    })

    const token = randomBytes(32).toString('hex')
    const expiresAt = addHours(new Date(), 1)

    await prisma.passwordResetToken.create({
      data: { doctorId: doctor.id, token, expiresAt },
    })

    const resetUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/doctor/reset-password?token=${token}`

    await sendEmail({
      to: doctor.email,
      subject: 'Reset your Clinic App password',
      html: passwordResetHtml(resetUrl, doctor.name),
    })

    return Response.json({ message: 'If that email exists, a reset link has been sent.' })
  } catch (error) {
    console.error('[forgot-password]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
