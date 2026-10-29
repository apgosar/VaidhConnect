import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import RegisterClient from '@/components/patient/RegisterClient'

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const tenant = await getTenant()
  const doctorDoc = tenant ? await tenantDb(tenant).profile().get() : null
  const doctorData = doctorDoc?.exists ? doctorDoc.data()! : {}

  const config = {
    enableChiefComplaint: doctorData.enableChiefComplaint ?? true,
    enableMedicalHistory: doctorData.enableMedicalHistory ?? true,
  }

  return <RegisterClient config={config} />
}
