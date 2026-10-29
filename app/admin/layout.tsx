import { notFound } from 'next/navigation'
import { adminHostAllowed } from '@/lib/auth/platform'

// The operator console only exists on hosts listed in PLATFORM_ADMIN_HOSTS;
// on every clinic hostname these pages simply 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await adminHostAllowed())) notFound()
  return <>{children}</>
}
