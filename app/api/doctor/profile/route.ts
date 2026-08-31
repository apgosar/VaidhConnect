import { adminDb, adminAuth } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { uploadFile } from '@/lib/storage'
// bcrypt is no longer used since Firebase handles password auth

export const dynamic = 'force-dynamic'

// GET doctor profile
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorDoc = await adminDb.collection('doctors').doc(session.uid).get()
    
    if (!doctorDoc.exists) {
      return Response.json({ error: 'Doctor not found' }, { status: 404 })
    }

    return Response.json({ doctor: { id: doctorDoc.id, ...doctorDoc.data() } })
  } catch (error) {
    console.error('[doctor-profile-get]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — update doctor settings
export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorRef = adminDb.collection('doctors').doc(session.uid)
    const doctorDoc = await doctorRef.get()
    
    if (!doctorDoc.exists) {
      return Response.json({ error: 'Doctor profile not found.' }, { status: 404 })
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
        const logoUrl = await uploadFile(buffer, `logos/${session.uid}.${ext}`, logoFile.type)
        await doctorRef.update({ logoUrl })
        return Response.json({ doctor: { logoUrl } })
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
        const qrCodeUrl = await uploadFile(buffer, `qrcodes/${session.uid}.${ext}`, qrCodeFile.type)
        
        const existingData = doctorDoc.data()
        let paymentDetails: any = existingData?.paymentDetails || {}
        
        await doctorRef.update({
          paymentDetails: { ...paymentDetails, qrCodeUrl },
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
        const photoUrl = await uploadFile(buffer, `photos/${session.uid}.${ext}`, photoFile.type)
        await doctorRef.update({ photoUrl })
        return Response.json({ doctor: { photoUrl } })
      }

      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // JSON settings update
    const body = await request.json()
    const {
      name, email, clinicName, address, mapsUrl, websiteUrl, phone, whatsappPhone,
      specialty, practiceDescription, themeColor, qualifications, slotDurationMins,
      timings, paymentDetails, reminderIntervals,
      registrationNumber, youtubeLinks, products, pageViews,
      newPassword,
      enableChiefComplaint, enableMedicalHistory,
      consultationFee, followUpFee, summaryHour,
    } = body

    const updateData: Record<string, unknown> = {}

    if (name) updateData.name = name.trim()
    if (email) updateData.email = email.trim()
    if (clinicName) updateData.clinicName = clinicName.trim()
    if (address !== undefined) updateData.address = address?.trim() || null
    if (mapsUrl !== undefined) updateData.mapsUrl = mapsUrl?.trim() || null
    if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl?.trim() || null
    if (phone !== undefined) updateData.phone = phone?.trim() || null
    if (whatsappPhone !== undefined) updateData.whatsappPhone = whatsappPhone?.trim() || null
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
    if (enableChiefComplaint !== undefined) updateData.enableChiefComplaint = enableChiefComplaint
    if (enableMedicalHistory !== undefined) updateData.enableMedicalHistory = enableMedicalHistory
    if (consultationFee !== undefined) updateData.consultationFee = consultationFee?.trim() || null
    if (followUpFee !== undefined) updateData.followUpFee = followUpFee?.trim() || null
    if (summaryHour !== undefined) updateData.summaryHour = typeof summaryHour === 'number' ? summaryHour : parseInt(summaryHour)
    
    if (products !== undefined) {
      // Upload any base64 product images to Storage to avoid Firestore 1MB document limits and invalid entity errors
      for (let i = 0; i < products.length; i++) {
        const prod = products[i];
        if (prod.photoUrl && prod.photoUrl.startsWith('data:image/')) {
          try {
            const match = prod.photoUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              const buffer = Buffer.from(base64Data, 'base64');
              const ext = mimeType.split('/')[1] || 'jpg';
              // We need to import uploadFile at the top of the file, it's already imported!
              const url = await uploadFile(buffer, `products/${session.uid}_${prod.id}.${ext}`, mimeType);
              prod.photoUrl = url;
            }
          } catch (err) {
            console.error('Failed to upload product image to storage', err);
            // If it fails, we remove the massive base64 string so it doesn't crash Firestore
            prod.photoUrl = null; 
          }
        }
      }
      updateData.products = products
    }
    if (pageViews !== undefined) updateData.pageViews = pageViews

    // Password change (requires re-auth on client side if currentPassword check is strictly needed, 
    // but here we can just update via Admin SDK if we trust the session)
    if (newPassword) {
      if (newPassword.length < 6) {
        return Response.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
      }
      // Note: In Firebase, checking current password on the server without it is generally not possible 
      // without re-authenticating. If the client sends it, we trust the secure session to allow admin update.
      await adminAuth.updateUser(session.uid, { password: newPassword })
    }

    if (Object.keys(updateData).length > 0) {
      // Recursively remove undefined values to prevent Firestore 'invalid nested entity' errors
      const deepClean = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(deepClean).filter(v => v !== undefined);
        } else if (obj !== null && typeof obj === 'object') {
          return Object.fromEntries(
            Object.entries(obj)
              .map(([k, v]) => [k, deepClean(v)])
              .filter(([_, v]) => v !== undefined)
          );
        }
        return obj;
      };
      
      const sanitizedData = deepClean(updateData);
      await doctorRef.update(sanitizedData);
    }

    const updatedDoc = await doctorRef.get()
    return Response.json({ doctor: { id: updatedDoc.id, ...updatedDoc.data() } })
  } catch (error: any) {
    console.error('[doctor-profile-patch]', error)
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
