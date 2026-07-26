import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return Response.json({ error: 'Token and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return Response.json({ error: 'Invalid or expired reset token' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.$transaction([
      prisma.doctor.update({
        where: { id: resetToken.doctorId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ])

    return Response.json({ message: 'Password reset successfully' })
  } catch (error) {
    console.error('[reset-password]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
