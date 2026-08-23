import { adminDb } from '@/lib/firebase/server'
import RegisterClient from '@/components/patient/RegisterClient'

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const doctorsSnap = await adminDb.collection('doctors').limit(1).get()
  const doctorData = doctorsSnap.empty ? {} : doctorsSnap.docs[0].data()

  const config = {
    enableChiefComplaint: doctorData.enableChiefComplaint ?? true,
    enableMedicalHistory: doctorData.enableMedicalHistory ?? true,
  }

  return <RegisterClient config={config} />
}
