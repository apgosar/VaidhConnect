import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import { DEFAULT_TIMINGS } from '../lib/constants'

async function main() {
  console.log('🌱 Seeding database...')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    const existing = await prisma.doctor.findUnique({
      where: { email: 'doctor@clinic.app' },
    })

    if (existing) {
      console.log('✅ Doctor already exists, skipping seed.')
      return
    }

    const passwordHash = await bcrypt.hash('changeme123', 12)

    const doctor = await prisma.doctor.create({
      data: {
        name: 'Your Name',
        email: 'doctor@clinic.app',
        passwordHash,
        clinicName: 'My Clinic',
        specialty: 'General Physician',
        themeColor: '#3B82F6',
        qualifications: 'MBBS',
        slotDurationMins: 15,
        timings: DEFAULT_TIMINGS as unknown as import('@prisma/client').Prisma.InputJsonValue,
        paymentDetails: { upiId: '', bankDetails: '', qrCodeUrl: '' },
        reminderIntervals: [24, 1],
      },
    })

    console.log(`✅ Created doctor: ${doctor.email}`)
    console.log(`\n⚠️  Default credentials:`)
    console.log(`   Email:    doctor@clinic.app`)
    console.log(`   Password: changeme123`)
    console.log(`\n🔒 IMPORTANT: Change your password after first login via Settings!`)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
