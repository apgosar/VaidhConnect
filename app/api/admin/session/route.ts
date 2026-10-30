import { NextResponse } from 'next/server'
import { adminHostAllowed, createAdminSession, clearAdminSession, getPlatformAdmin } from '@/lib/auth/platform'
import { apiError } from '@/lib/errors'

const notFound = () => apiError('NOT_FOUND')

export async function GET() {
  if (!(await adminHostAllowed())) return notFound()
  const admin = await getPlatformAdmin()
  return NextResponse.json({ authenticated: !!admin, email: admin?.email ?? null })
}

export async function POST(request: Request) {
  if (!(await adminHostAllowed())) return notFound()
  const { idToken } = await request.json().catch(() => ({}))
  if (typeof idToken !== 'string' || !(await createAdminSession(idToken))) {
    return NextResponse.json({ error: 'This account is not a platform operator' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  if (!(await adminHostAllowed())) return notFound()
  await clearAdminSession()
  return NextResponse.json({ ok: true })
}
