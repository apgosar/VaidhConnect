import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { tenantDb } from '@/lib/db/tenant'
import { deleteFile, getSignedDownloadUrl, tenantPath, uploadFile } from '@/lib/storage'
import type { Tenant } from '@/lib/tenant/types'

export const MAX_SCANS_PER_VISIT = 10
export const MAX_SCAN_BYTES = 12 * 1024 * 1024

export class ScanError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface StoredScan { id: string; path: string; uploadedAt: string; uploadedBy: string }
export interface ScanView { id: string; url: string; uploadedAt: string }

/** The bytes must really be a JPEG, PNG or WebP picture; the label the browser sent proves nothing. */
export function looksLikePhoto(b: Buffer): boolean {
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const png = b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const webp = b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'
  return jpeg || png || webp
}

/**
 * Keeps a photo of the doctor's handwritten prescription with the visit, for the clinic's records.
 * Phone photos are turned upright, shrunk to a readable size and stored as JPEG, privately.
 */
export async function addScan(tenant: Tenant, appointmentId: string, actorUid: string, file: { size: number; data: Buffer }): Promise<StoredScan> {
  const db = tenantDb(tenant)
  if (file.size > MAX_SCAN_BYTES) throw new ScanError(400, 'That photo is too large. Please use one under 12 MB.')
  if (!looksLikePhoto(file.data)) throw new ScanError(400, 'Only photos (JPG, PNG or WebP) can be added')

  const ref = db.col('appointments').doc(appointmentId)
  const snap = await ref.get()
  if (!snap.exists) throw new ScanError(404, 'Appointment not found')
  const existing = (snap.data()?.rxScans ?? []) as StoredScan[]
  if (existing.length >= MAX_SCANS_PER_VISIT) throw new ScanError(400, `A visit can have up to ${MAX_SCANS_PER_VISIT} photos. Remove one to add another.`)

  let jpeg: Buffer
  try {
    jpeg = await sharp(file.data).rotate().resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  } catch {
    throw new ScanError(400, 'That file is not a valid photo')
  }
  const id = randomUUID()
  const path = tenantPath(tenant, `rx-scans/${appointmentId}/${id}.jpg`)
  await uploadFile(jpeg, path, 'image/jpeg')
  const scan: StoredScan = { id, path, uploadedAt: new Date().toISOString(), uploadedBy: actorUid }
  try {
    // Checked again inside the transaction, so two photos added at the same moment cannot pass the limit together.
    await ref.firestore.runTransaction(async tx => {
      const current = await tx.get(ref)
      const scans = (current.data()?.rxScans ?? []) as StoredScan[]
      if (scans.length >= MAX_SCANS_PER_VISIT) throw new ScanError(400, `A visit can have up to ${MAX_SCANS_PER_VISIT} photos. Remove one to add another.`)
      tx.update(ref, { rxScans: [...scans, scan], updatedAt: new Date() })
    })
  } catch (e) {
    await deleteFile(path)
    throw e
  }
  return scan
}

/** The visit's photos with short-lived links, oldest first. Callers must already have checked the viewer may see them. */
export async function listScans(tenant: Tenant, appointmentId: string): Promise<ScanView[]> {
  const snap = await tenantDb(tenant).col('appointments').doc(appointmentId).get()
  if (!snap.exists) throw new ScanError(404, 'Appointment not found')
  const scans = ((snap.data()?.rxScans ?? []) as StoredScan[]).slice().sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
  return Promise.all(scans.map(async s => ({ id: s.id, uploadedAt: s.uploadedAt, url: await getSignedDownloadUrl(s.path, 15) })))
}

export async function removeScan(tenant: Tenant, appointmentId: string, scanId: string): Promise<void> {
  const ref = tenantDb(tenant).col('appointments').doc(appointmentId)
  const snap = await ref.get()
  if (!snap.exists) throw new ScanError(404, 'Appointment not found')
  const target = ((snap.data()?.rxScans ?? []) as StoredScan[]).find(s => s.id === scanId)
  if (!target) throw new ScanError(404, 'Photo not found')
  await ref.firestore.runTransaction(async tx => {
    const current = await tx.get(ref)
    tx.update(ref, { rxScans: ((current.data()?.rxScans ?? []) as StoredScan[]).filter(s => s.id !== scanId), updatedAt: new Date() })
  })
  await deleteFile(target.path)
}
