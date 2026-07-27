import { Storage } from '@google-cloud/storage'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const USE_GCS = !!process.env.GCS_BUCKET_NAME

const storage = USE_GCS
  ? new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE || undefined,
    })
  : null

const bucket = USE_GCS && storage ? storage.bucket(process.env.GCS_BUCKET_NAME!) : null

/**
 * Upload a buffer/file to GCS (production) or local filesystem (development).
 * Returns a public URL or local path.
 */
export async function uploadFile(
  fileBuffer: Buffer,
  destinationPath: string, // e.g. 'prescriptions/abc123.pdf'
  mimeType: string = 'application/octet-stream'
): Promise<string> {
  if (USE_GCS && bucket) {
    const file = bucket.file(destinationPath)
    await file.save(fileBuffer, {
      metadata: { contentType: mimeType },
      resumable: false,
    })
    await file.makePublic()
    return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${destinationPath}`
  } else {
    // Ephemeral environment fallback (like Cloud Run without GCS)
    // Convert file to Base64 data URI so it can be stored directly in the database String fields
    const base64Data = fileBuffer.toString('base64')
    return `data:${mimeType};base64,${base64Data}`
  }
}

/**
 * Delete a file from GCS or local filesystem.
 */
export async function deleteFile(filePathOrUrl: string): Promise<void> {
  if (filePathOrUrl.startsWith('data:')) {
    // Base64 string, nothing to delete on filesystem
    return
  }

  if (USE_GCS && bucket) {
    // Extract GCS path from URL
    const gcsPath = filePathOrUrl.replace(
      `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/`,
      ''
    )
    try {
      await bucket.file(gcsPath).delete()
    } catch {
      // Ignore not found errors
    }
  } else {
    const { unlink } = await import('fs/promises')
    const localPath = path.join(process.cwd(), 'public', filePathOrUrl)
    try {
      await unlink(localPath)
    } catch {
      // Ignore not found errors
    }
  }
}
