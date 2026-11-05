import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { getSession } from '@/lib/auth/session'
import { uploadFile, deleteFile, tenantPath } from '@/lib/storage'
import sharp, { type Sharp, type Metadata } from 'sharp'
import { DEFAULT_MARGINS, parseMargins } from '@/lib/pdf/layout'
import { prepareLetterhead, LetterheadError } from '@/lib/modules/letterhead'
import { forbid } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { isUsablePrimary } from '@/lib/tenant/theme'
import { FieldValue } from 'firebase-admin/firestore'
import { apiError } from '@/lib/errors'
import { cleanAdviceOptions } from '@/lib/advice'
import { cleanBottomNav } from '@/lib/bottomNav'
import { cleanClinicPhones, MAX_CLINIC_PHONES } from '@/lib/clinicPhones'
import { MAX_ADVICE_LENGTH, MAX_ADVICE_OPTIONS } from '@/lib/constants'

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
      return apiError('UNAUTHORIZED')
    }

    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
    const doctorDoc = await tenantDb(tenant).profile().get()
    
    if (!doctorDoc.exists) {
      return Response.json({ error: 'Doctor not found' }, { status: 404 })
    }

    return Response.json({ doctor: { id: doctorDoc.id, ...doctorDoc.data() } })
  } catch (error) {
    console.error('[doctor-profile-get]', error)
    return apiError('SERVER_ERROR')
  }
}

// PATCH — update doctor settings
export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session?.uid) {
      return apiError('UNAUTHORIZED')
    }
    const denied = forbid(session, 'settings:manage')
    if (denied) return denied

    const tenant = await getTenant()
    if (!tenant) return apiError('CLINIC_NOT_FOUND')
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
      const signatureFile = formData.get('signature') as File | null

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

      // Letterhead: a PDF or picture of one A4 page, drawn behind prescriptions. Kept private; only our own PDF code reads it.
      // The space its printed header and footer take is measured, so text is placed in the empty part between them.
      if (letterheadFile) {
        try {
          const prepared = await prepareLetterhead(Buffer.from(await letterheadFile.arrayBuffer()))
          const path = tenantPath(tenant, `letterheads/${doctorRef.id}.${prepared.ext}`)
          const previous = doctorDoc.data()?.letterheadPath as string | undefined
          await uploadFile(prepared.buffer, path, prepared.contentType)
          if (previous && previous !== path) await deleteFile(previous)
          const printSettings = { ...DEFAULT_MARGINS, ...(parseMargins(doctorDoc.data()?.printSettings) ?? {}), ...prepared.spacing }
          await doctorRef.update({ letterheadPath: path, printSettings })
          return Response.json({ doctor: { letterheadPath: path, printSettings }, found: { header: prepared.zones.headerEndMm !== null, footer: prepared.zones.footerStartMm !== null } })
        } catch (e) {
          if (e instanceof LetterheadError) return Response.json({ error: e.message }, { status: e.status })
          throw e
        }
      }

      // Signature: a picture (ideally on a transparent or white background) printed above the doctor's name. Kept private.
      if (signatureFile) {
        if (signatureFile.size > 2 * 1024 * 1024) return Response.json({ error: 'The signature must be under 2MB' }, { status: 400 })
        if (!allowedTypes.includes(signatureFile.type)) return Response.json({ error: 'The signature must be a JPG, PNG or WebP picture' }, { status: 400 })
        const raw = Buffer.from(await signatureFile.arrayBuffer())
        if (!looksLikeImage(raw, signatureFile.type)) return Response.json({ error: 'That file is not a valid image' }, { status: 400 })
        let buffer: Buffer
        try {
          buffer = await sharp(raw).rotate().trim({ background: '#ffffff', threshold: 20 }).resize({ width: 600, height: 300, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
        } catch { return Response.json({ error: 'That file is not a valid image' }, { status: 400 }) }
        const path = tenantPath(tenant, `signatures/${doctorRef.id}.png`)
        await uploadFile(buffer, path, 'image/png')
        await doctorRef.update({ signaturePath: path })
        return Response.json({ doctor: { signaturePath: path } })
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
      printSettings, removeLetterhead, removeSignature, adviceOptions, phones, bottomNav,
    } = body

    const updateData: Record<string, unknown> = {}

    if (name) updateData.name = name.trim()
    if (email) updateData.email = email.trim()
    if (clinicName) updateData.clinicName = clinicName.trim()
    if (address !== undefined) updateData.address = address?.trim() || null
    if (mapsUrl !== undefined) updateData.mapsUrl = mapsUrl?.trim() || null
    if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl?.trim() || null
    if (phone !== undefined) updateData.phone = phone?.trim() || null
    // Several clinic numbers: the first is the main one and is also kept in `phone` for everything that shows one number.
    if (phones !== undefined) {
      const list = cleanClinicPhones(phones)
      if (!list) return Response.json({ error: `Enter valid phone numbers (up to ${MAX_CLINIC_PHONES})` }, { status: 400 })
      updateData.phones = list
      updateData.phone = list[0] ?? null
    }
    if (bottomNav !== undefined) {
      const nav = cleanBottomNav(bottomNav)
      if (bottomNav !== null && !nav) return Response.json({ error: 'Choose exactly three buttons for the bottom bar' }, { status: 400 })
      updateData.bottomNav = nav
    }
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

    // The advice the doctor ticks on a prescription: trimmed, no blanks, no repeats.
    if (adviceOptions !== undefined) {
      const list = cleanAdviceOptions(adviceOptions)
      if (!list) return Response.json({ error: `Advice can have at most ${MAX_ADVICE_OPTIONS} items of ${MAX_ADVICE_LENGTH} characters each` }, { status: 400 })
      updateData.adviceOptions = list
    }

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

    if (removeSignature === true) {
      const existing = doctorDoc.data()?.signaturePath as string | undefined
      if (existing) await deleteFile(existing)
      await doctorRef.update({ signaturePath: FieldValue.delete() })
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
    return apiError('SERVER_ERROR')
  }
}
