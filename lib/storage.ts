import { adminStorage } from './firebase/server'
import path from 'path'

/**
 * Upload a buffer/file to Firebase Storage.
 * Returns a public URL.
 */
export async function uploadFile(
  fileBuffer: Buffer,
  destinationPath: string, // e.g. 'prescriptions/abc123.pdf'
  mimeType: string = 'application/octet-stream'
): Promise<string> {
  const bucket = adminStorage.bucket();
  const file = bucket.file(destinationPath);
  
  await file.save(fileBuffer, {
    metadata: { contentType: mimeType },
    resumable: false,
  });
  
  await file.makePublic();
  
  // The bucket name might not be strictly equal to process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, 
  // but bucket.name gives us the correct configured bucket.
  return `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
}

/**
 * Delete a file from Firebase Storage.
 */
export async function deleteFile(filePathOrUrl: string): Promise<void> {
  if (filePathOrUrl.startsWith('data:')) {
    // Base64 string, nothing to delete on filesystem
    return
  }

  const bucket = adminStorage.bucket();
  
  // Extract GCS path from URL
  const urlPrefix = `https://storage.googleapis.com/${bucket.name}/`;
  if (filePathOrUrl.startsWith(urlPrefix)) {
    const gcsPath = filePathOrUrl.replace(urlPrefix, '');
    try {
      await bucket.file(gcsPath).delete();
    } catch {
      // Ignore not found errors
    }
  }
}
