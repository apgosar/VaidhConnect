import { requirePermission } from '@/lib/auth/guard'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePermission('logs:view')
  return <>{children}</>
}
