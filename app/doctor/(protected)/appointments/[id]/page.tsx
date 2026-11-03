import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/access'
import AppointmentView from './AppointmentView'

export const dynamic = 'force-dynamic'

export default async function AppointmentDetailPage() {
  const session = await getSession()
  return <AppointmentView canPrescribe={can(session?.role, 'prescriptions:manage')} />
}
