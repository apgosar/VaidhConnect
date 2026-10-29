import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { uploadFile, deleteFile, tenantPath } from '@/lib/storage'
import sharp, { type Sharp, type Metadata } from 'sharp'
import { A4_RATIO, A4_RATIO_TOLERANCE, parseMargins } from '@/lib/pdf/layout'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { isUsablePrimary } from '@/lib/tenant/theme'
import { FieldValue } from 'firebase-admin/firestore'

// SVG is deliberately not accepted: it can carry script, and these files are
// served from our storage domain. Only raster formats, verified by signature.
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
function looksLikeImage(b: Buffer, type: string): boolean {
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (type === 'image/png') return b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (type === 'image/webp') return b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}
// bcrypt is no longer used since Firebase handles password auth

export const dynamic = 'force-dynamic'

// GET doctor profile
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const doctorDoc = await tenantDb(tenant).profile().get()
    
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
    const denied = forbid(session, 'settings:manage')
    if (denied) return denied

    const tenant = await getTenant()
    if (!tenant) return Response.json({ error: 'Clinic not found' }, { status: 404 })
    const doctorRef = tenantDb(tenant).profile()
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
      const letterheadFile = formData.get('letterhead') as File | null

      const allowedTypes = Object.keys(IMAGE_EXT)

      // Handle Logo upload
      if (logoFile) {
        if (logoFile.size > 2 * 1024 * 1024) {
          return Response.json({ error: 'File size must be under 2MB' }, { status: 400 })
        }
        if (!allowedTypes.includes(logoFile.type)) {
          return Response.json({ error: 'Only JPEG, PNG and WebP images are allowed' }, { status: 400 })
        }
        const buffer = Buffer.from(await logoFile.arrayBuffer())
        if (!looksLikeImage(buffer, logoFile.type)) {
          return Response.json({ error: 'That file is not a valid image' }, { status: 400 })
        }
        const ext = IMAGE_EXT[logoFile.type]
        const logoUrl = await uploadFile(buffer, tenantPath(tenant, `logos/${session.uid}.${ext}`), logoFile.type, { public: true })
        await doctorRef.update({ logoUrl })
        return Response.json({ doctor: { logoUrl } })
      }

      // Letterhead: a full A4 page image that sits behind prescriptions. Kept private; only our own PDF code reads it.
      if (letterheadFile) {
        if (letterheadFile.size > 5 * 1024 * 1024) {
          return Response.json({ error: 'The letterhead must be under 5MB' }, { status: 400 })
        }
        if (letterheadFile.type !== 'image/jpeg' && letterheadFile.type !== 'image/png') {
          return Response.json({ error: 'The letterhead must be a JPG or PNG image of a full A4 page' }, { status: 400 })
        }
        const raw = Buffer.from(await letterheadFile.arrayBuffer())
        if (!looksLikeImage(raw, letterheadFile.type)) {
          return Response.json({ error: 'That file is not a valid image' }, { status: 400 })
        }
        let image: Sharp
        let meta: Metadata
        try {
          image = sharp(raw).rotate() // honour the phone/scanner orientation tag
          meta = await image.metadata()
        } catch {
          return Response.json({ error: 'That file is not a valid image' }, { status: 400 })
        }
        // EXIF orientations 5-8 are sideways: the stored width is the displayed height
        const sideways = (meta.orientation ?? 1) >= 5
        const width = (sideways ? meta.height : meta.width) ?? 0
        const height = (sideways ? meta.width : meta.height) ?? 0
        if (!width || !height || Math.abs(width / height - A4_RATIO) > A4_RATIO_TOLERANCE) {
          return Response.json({ error: 'The letterhead should be a portrait A4 page (210 x 297 mm). Export or scan the whole page.' }, { status: 400 })
        }
        // A4 at 200 dpi is plenty for print and keeps every PDF small.
        const resized = image.resize({ width: 1654, height: 2339, fit: 'inside', withoutEnlargement: true })
        const isPng = letterheadFile.type === 'image/png'
        const buffer = await (isPng ? resized.png() : resized.jpeg({ quality: 88 })).toBuffer()
        const ext = isPng ? 'png' : 'jpg'
        const path = tenantPath(tenant, `letterheads/${doctorRef.id}.${ext}`)
        const previous = doctorDoc.data()?.letterheadPath as string | undefined
        await uploadFile(buffer, path, isPng ? 'image/png' : 'image/jpeg')
        if (previous && previous !== path) await deleteFile(previous)
        await doctorRef.update({ letterheadPath: path })
        return Response.json({ doctor: { letterheadPath: path } })
      }

      // Handle QR Code upload
      if (qrCodeFile) {
        if (qrCodeFile.size > 2 * 1024 * 1024) {
          return Response.json({ error: 'File size must be under 2MB' }, { status: 400 })
        }
        if (!allowedTypes.includes(qrCodeFile.type)) {
          return Response.json({ error: 'Only JPEG, PNG and WebP images are allowed' }, { status: 400 })
        }
        const buffer = Buffer.from(await qrCodeFile.arrayBuffer())
        if (!looksLikeImage(buffer, qrCodeFile.type)) {
          return Response.json({ error: 'That file is not a valid image' }, { status: 400 })
        }
        const ext = IMAGE_EXT[qrCodeFile.type]
        const qrCodeUrl = await uploadFile(buffer, tenantPath(tenant, `qrcodes/${session.uid}.${ext}`), qrCodeFile.type, { public: true })
        
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
          return Response.json({ error: 'Only JPEG, PNG and WebP images are allowed' }, { status: 400 })
        }
        const buffer = Buffer.from(await photoFile.arrayBuffer())
        if (!looksLikeImage(buffer, photoFile.type)) {
          return Response.json({ error: 'That file is not a valid image' }, { status: 400 })
        }
        const ext = IMAGE_EXT[photoFile.type]
        const photoUrl = await uploadFile(buffer, tenantPath(tenant, `photos/${session.uid}.${ext}`), photoFile.type, { public: true })
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
      theme,
      enableChiefComplaint, enableMedicalHistory,
      consultationFee, followUpFee, summaryHour,
      printSettings, removeLetterhead,
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
              const url = await uploadFile(buffer, `products/${session.uid}_${prod.id}.${ext}`, mimeType, { public: true });
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

    // Spacing, in mm, left clear for a letterhead's printed artwork.
    if (printSettings !== undefined) {
      const margins = parseMargins(printSettings)
      if (!margins) return Response.json({ error: 'Spacing must be between 0 and 120 mm (top), 100 mm (bottom) and 60 mm (sides)' }, { status: 400 })
      updateData.printSettings = margins
    }

    if (removeLetterhead === true) {
      const existing = doctorDoc.data()?.letterheadPath as string | undefined
      if (existing) await deleteFile(existing)
      // not through updateData: its deep-clean would flatten the delete marker
      await doctorRef.update({ letterheadPath: FieldValue.delete() })
    }

    // Brand colour: validated (hex + enough contrast for white text); null/'' resets to the default look.
    if (theme !== undefined) {
      const primary = theme?.primary
      if (primary === null || primary === '') updateData.theme = FieldValue.delete()
      else if (typeof primary === 'string' && isUsablePrimary(primary)) updateData.theme = { primary }
      else return Response.json({ error: 'Choose a darker brand colour (hex like #0B6E4F) so white text stays readable' }, { status: 400 })
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
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
