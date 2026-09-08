import { adminDb } from '@/lib/firebase/server'
import { getSession } from '@/lib/auth/session'
import { getSignedDownloadUrl } from '@/lib/storage'
import { NextResponse } from 'next/server'

// GET /api/prescriptions/[id]/pdf — redirects to a short-lived signed URL.
// Prescription PDFs are private (clinical data); only an authenticated
// doctor session can generate a link to view one.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const doc = await adminDb.collection('prescriptions').doc(id).get()
  if (!doc.exists) {
    return NextResponse.json({ error: 'Prescription not found' }, { status: 404 })
  }

  const pdfPath = doc.data()?.pdfPath as string | undefined
  if (!pdfPath) {
    return NextResponse.json({ error: 'No PDF on file for this prescription' }, { status: 404 })
  }

  try {
    const url = await getSignedDownloadUrl(pdfPath)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('[prescription-pdf-get]', error)
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
