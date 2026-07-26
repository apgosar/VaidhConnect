import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const doctor = await prisma.doctor.findUnique({
          where: { email: credentials.email as string },
        })

        if (!doctor) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          doctor.passwordHash
        )

        if (!isValid) return null

        return {
          id: doctor.id,
          email: doctor.email,
          name: doctor.name,
          clinicName: doctor.clinicName,
          specialty: doctor.specialty,
          themeColor: doctor.themeColor,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/doctor/login',
    error: '/doctor/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        const u = user as unknown as Record<string, unknown>
        token.clinicName = u.clinicName
        token.specialty = u.specialty
        token.themeColor = u.themeColor
      }
      if (trigger === 'update' && session) {
        if (session.clinicName) token.clinicName = session.clinicName
        if (session.specialty) token.specialty = session.specialty
        if (session.themeColor) token.themeColor = session.themeColor
        if (session.name) token.name = session.name
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        const su = session.user as unknown as Record<string, unknown>
        su.clinicName = token.clinicName
        su.specialty = token.specialty
        su.themeColor = token.themeColor
      }
      return session
    },
  },
})
