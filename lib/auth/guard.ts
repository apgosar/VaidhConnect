import { redirect } from 'next/navigation'
import { getSession } from './session'
import { can, type Permission } from './access'

/** For server layouts/pages: send users without the permission back to the dashboard. */
export async function requirePermission(permission: Permission) {
  const session = await getSession()
  if (!session) redirect('/doctor/login')
  if (!can(session.role, permission)) redirect('/doctor/dashboard')
  return session
}
