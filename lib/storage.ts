import { adminStorage } from './firebase/server'

/**
 * Upload a buffer/file to Firebase Storage.
 *
 * Public assets (logos, doctor photos, QR codes, product images) are meant
 * to be shown on the public patient portal, so pass `{ public: true }` to
 * get a direct, permanently-public URL back.
 *
 * Everything else (prescriptions, receipts) holds clinical or financial
 * data and stays private by default — only the internal object path is
 * returned. Use getSignedDownloadUrl() to hand an authorized viewer a
 * short-lived link.
 */
export async function uploadFile(
  fileBuffer: Buffer,
  destinationPath: string, // e.g. 'prescriptions/abc123.pdf'
  mimeType: string = 'application/octet-stream',
  options: { public?: boolean } = {}
): Promise<string> {
  const bucket = adminStorage.bucket();
  const file = bucket.file(destinationPath);

  await file.save(fileBuffer, {
    metadata: { contentType: mimeType },
    resumable: false,
  });

  if (options.public) {
    await file.makePublic();
    // bucket.name gives us the actual configured bucket, which might not be
    // strictly equal to process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.
    return `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
  }

  return destinationPath;
}

/**
 * Generate a short-lived signed URL to read a private object. Callers are
 * responsible for verifying the requester is authorized before calling this.
 */
export async function getSignedDownloadUrl(objectPath: string, expiresInMinutes = 15): Promise<string> {
  const bucket = adminStorage.bucket();
  const [url] = await bucket.file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });
  return url;
}

/**
 * Delete a file from Firebase Storage. Accepts either a public URL or a
 * bare object path (private files are stored as bare paths).
 */
export async function deleteFile(filePathOrUrl: string): Promise<void> {
  if (filePathOrUrl.startsWith('data:')) {
    // Base64 string, nothing to delete on filesystem
    return
  }

  const bucket = adminStorage.bucket();
  const urlPrefix = `https://storage.googleapis.com/${bucket.name}/`;
  const gcsPath = filePathOrUrl.startsWith(urlPrefix)
    ? filePathOrUrl.replace(urlPrefix, '')
    : filePathOrUrl;

  try {
    await bucket.file(gcsPath).delete();
  } catch {
    // Ignore not found errors
  }
}
