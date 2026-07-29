import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { uploadFile } from '@/lib/storage'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

// GET doctor profile
export async function GET() {
  try {
    const doctor = await prisma.doctor.findFirst({
      select: {
        id: true,
        name: true,
        email: true,
        clinicName: true,
        logoUrl: true,
        address: true,
        mapsUrl: true,
        websiteUrl: true,
        phone: true,
        specialty: true,
        practiceDescription: true,
        themeColor: true,
        qualifications: true,
        slotDurationMins: true,
        timings: true,
        paymentDetails: true,
        reminderIntervals: true,
        registrationNumber: true,
        photoUrl: true,
        youtubeLinks: true,
        products: true,
        pageViews: true,
      },
    })

    if (!doctor) {
      return Response.json({ error: 'Doctor not found' }, { status: 404 })
    }

    return Response.json({ doctor })
  } catch (error) {
    console.error('[doctor-profile-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — update doctor settings
export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorRecord = await prisma.doctor.findUnique({ where: { id: session.user.id } })
    if (!doctorRecord) {
      return Response.json({ error: 'Invalid session. Please log out and log back in.' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') ?? ''

    // Handle multipart (logo or QR code upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const logoFile = formData.get('logo') as File | null
      const qrCodeFile = formData.get('qrCode') as File | null
      const photoFile = formData.get('photo') as File | null

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

      // Handle Logo upload
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          return Response.json({ error: 'File size must be under 2MB' }, { status: 400 })
        }
        if (!allowedTypes.includes(logoFile.type)) {
          return Response.json({ error: 'Only JPEG, PNG, WebP and SVG images are allowed' }, { status: 400 })
        }
        const buffer = Buffer.from(await logoFile.arrayBuffer())
        const ext = logoFile.name.split('.').pop() ?? 'jpg'
        const logoUrl = await uploadFile(buffer, `logos/${session.user.id}.${ext}`, logoFile.type)
        const doctor = await prisma.doctor.update({ where: { id: session.user.id }, data: { logoUrl } })
        return Response.json({ doctor: { logoUrl: doctor.logoUrl } })
      }

      // Handle QR Code upload
      if (qrCodeFile) {
        if (qrCodeFile.size > 2 * 1024 * 1024) {
          return Response.json({ error: 'File size must be under 2MB' }, { status: 400 })
        }
        if (!allowedTypes.includes(qrCodeFile.type)) {
          return Response.json({ error: 'Only JPEG, PNG, WebP and SVG images are allowed' }, { status: 400 })
        }
        const buffer = Buffer.from(await qrCodeFile.arrayBuffer())
        const ext = qrCodeFile.name.split('.').pop() ?? 'jpg'
        const qrCodeUrl = await uploadFile(buffer, `qrcodes/${session.user.id}.${ext}`, qrCodeFile.type)
        const existing = await prisma.doctor.findUnique({ where: { id: session.user.id }, select: { paymentDetails: true } })
        let paymentDetails: any = {}
        if (existing?.paymentDetails) {
          if (typeof existing.paymentDetails === 'string') {
            try { paymentDetails = JSON.parse(existing.paymentDetails) } catch { /* ignore */ }
          } else if (typeof existing.paymentDetails === 'object') {
            paymentDetails = existing.paymentDetails
          }
        }
        await prisma.doctor.update({
          where: { id: session.user.id },
          data: { paymentDetails: { ...paymentDetails, qrCodeUrl } },
        })
        return Response.json({ doctor: { qrCodeUrl } })
      }

      // Handle Dr Photo upload
      if (photoFile) {
        if (photoFile.size > 2 * 1024 * 1024) {
          return Response.json({ error: 'File size must be under 2MB' }, { status: 400 })
        }
        if (!allowedTypes.includes(photoFile.type)) {
          return Response.json({ error: 'Only JPEG, PNG, WebP and SVG images are allowed' }, { status: 400 })
        }
        const buffer = Buffer.from(await photoFile.arrayBuffer())
        const ext = photoFile.name.split('.').pop() ?? 'jpg'
        const photoUrl = await uploadFile(buffer, `photos/${session.user.id}.${ext}`, photoFile.type)
        const doctor = await prisma.doctor.update({ where: { id: session.user.id }, data: { photoUrl } })
        return Response.json({ doctor: { photoUrl: doctor.photoUrl } })
      }

      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // JSON settings update
    const body = await request.json()
    const {
      name, email, clinicName, address, mapsUrl, websiteUrl, phone,
      specialty, practiceDescription, themeColor, qualifications, slotDurationMins,
      timings, paymentDetails, reminderIntervals,
      registrationNumber, youtubeLinks, products, pageViews,
      currentPassword, newPassword,
    } = body

    const updateData: Record<string, unknown> = {}

    if (name) updateData.name = name.trim()
    if (email) updateData.email = email.trim()
    if (clinicName) updateData.clinicName = clinicName.trim()
    if (address !== undefined) updateData.address = address?.trim() || null
    if (mapsUrl !== undefined) updateData.mapsUrl = mapsUrl?.trim() || null
    if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl?.trim() || null
    if (phone !== undefined) updateData.phone = phone?.trim() || null
    if (specialty) updateData.specialty = specialty
    if (practiceDescription !== undefined) updateData.practiceDescription = practiceDescription?.trim() || null
    if (themeColor) updateData.themeColor = themeColor
    if (qualifications !== undefined) updateData.qualifications = qualifications?.trim() || null
    if (slotDurationMins) updateData.slotDurationMins = parseInt(slotDurationMins)
    if (timings) updateData.timings = timings
    if (paymentDetails) {
      if (typeof paymentDetails === 'string') {
        try { updateData.paymentDetails = JSON.parse(paymentDetails) } catch { updateData.paymentDetails = paymentDetails }
      } else {
        updateData.paymentDetails = paymentDetails
      }
    }
    if (reminderIntervals) updateData.reminderIntervals = reminderIntervals
    
    // New fields
    if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber?.trim() || "Reg. No: Pending"
    if (youtubeLinks !== undefined) updateData.youtubeLinks = youtubeLinks
    if (products !== undefined) updateData.products = products
    if (pageViews !== undefined) updateData.pageViews = pageViews

    // Password change
    if (newPassword) {
      if (!currentPassword) {
        return Response.json({ error: 'Current password required to change password' }, { status: 400 })
      }

      if (newPassword.length < 8) {
        return Response.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }

      const doctor = await prisma.doctor.findUnique({ where: { id: session.user.id } })
      if (!doctor) {
        return Response.json({ error: 'Not found' }, { status: 404 })
      }

      const valid = await bcrypt.compare(currentPassword, doctor.passwordHash)
      if (!valid) {
        return Response.json({ error: 'Current password is incorrect' }, { status: 400 })
      }

      updateData.passwordHash = await bcrypt.hash(newPassword, 12)
    }

    const doctor = await prisma.doctor.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true, name: true, email: true, clinicName: true, logoUrl: true,
        address: true, mapsUrl: true, websiteUrl: true, phone: true, specialty: true,
        practiceDescription: true,
        themeColor: true, qualifications: true, slotDurationMins: true,
        timings: true, paymentDetails: true, reminderIntervals: true,
        registrationNumber: true, photoUrl: true, youtubeLinks: true,
        products: true, pageViews: true,
      },
    })

    return Response.json({ doctor })
  } catch (error: any) {
    console.error('[doctor-profile-patch]', error)
    require('fs').appendFileSync('error.log', new Date().toISOString() + ': ' + error.stack + '\n')
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
