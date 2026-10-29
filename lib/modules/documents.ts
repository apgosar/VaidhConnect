import { renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'
import { tenantDb } from '../db/tenant'
import { formatDateShortInTz, formatDateTimeInTz } from '../time'
import { registerPdfFonts } from '../pdf/fonts'
import { PrescriptionDocument } from '../pdf/prescriptionDocument'
import { ReceiptDocument } from '../pdf/receiptDocument'
import type { PdfImage } from '../pdf/common'
import type { Tenant } from '../tenant/types'
import type { Medicine } from '../constants'

export interface RenderedPdf { buffer: Buffer; filename: string }

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Patient'

/**
 * The clinic logo as a PNG react-pdf can embed. Read on the server, so the page's
 * CSP/CORS never come into it. react-pdf only draws PNG/JPG; uploads may be WebP,
 * so everything is normalised. Anything unreachable or odd simply means no logo.
 */
export async function loadLogo(logoUrl: unknown): Promise<PdfImage | undefined> {
  if (typeof logoUrl !== 'string' || !logoUrl) return undefined
  try {
    let raw: Buffer
    if (logoUrl.startsWith('data:')) {
      raw = Buffer.from(logoUrl.split(',')[1] ?? '', 'base64')
    } else {
      // Logos are only ever stored in our own bucket; never fetch an arbitrary host.
      if (new URL(logoUrl).hostname !== 'storage.googleapis.com') return undefined
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return undefined
      raw = Buffer.from(await res.arrayBuffer())
    }
    const data = await sharp(raw).resize({ height: 160, withoutEnlargement: true }).png().toBuffer()
    return { data, format: 'png' }
  } catch {
    return undefined
  }
}

async function loadDoctor(tenant: Tenant) {
  const snap = await tenantDb(tenant).profile().get()
  if (!snap.exists) return null
  const d = snap.data() as any
  return {
    name: String(d.name ?? 'Doctor'),
    clinicName: String(d.clinicName ?? 'Clinic'),
    qualifications: d.qualifications || undefined,
    address: d.address || undefined,
    phone: d.phone || undefined,
    registrationNumber: d.registrationNumber || undefined,
    primary: d.theme?.primary as string | undefined,
    logoUrl: d.logoUrl as string | undefined,
  }
}

/** Renders a saved prescription. Returns null when it, its appointment, its patient or the clinic profile is missing. */
export async function renderPrescriptionPdf(tenant: Tenant, prescriptionId: string): Promise<RenderedPdf | null> {
  const db = tenantDb(tenant)
  const rx = await db.col('prescriptions').doc(prescriptionId).get()
  if (!rx.exists) return null
  const rxData = rx.data() as any

  const [apptSnap, patientSnap, doctor] = await Promise.all([
    db.col('appointments').doc(String(rxData.appointmentId)).get(),
    db.col('patients').doc(String(rxData.patientId)).get(),
    loadDoctor(tenant),
  ])
  if (!apptSnap.exists || !patientSnap.exists || !doctor) return null
  const appt = apptSnap.data() as any
  const patient = patientSnap.data() as any

  const when: Date = appt.startTime.toDate()
  const dateText = formatDateShortInTz(when, tenant.timezone)
  const { logoUrl, ...doctorProps } = doctor
  const logo = await loadLogo(logoUrl)

  registerPdfFonts()
  const buffer = await renderToBuffer(
    PrescriptionDocument({
      prescription: {
        id: rx.id,
        diagnosis: rxData.diagnosis,
        medicines: (rxData.medicines ?? []) as Medicine[],
        notes: rxData.notes,
      },
      patient: {
        name: String(patient.name ?? ''),
        phone: String(patient.phone ?? ''),
        // dates of birth are stored as UTC midnight
        dob: patient.dob ? formatDateShortInTz(patient.dob.toDate(), 'UTC') : '',
      },
      visit: { dateText, chiefComplaint: appt.chiefComplaint },
      doctor: { ...doctorProps, logo },
    }),
  )
  return { buffer, filename: `Prescription_${safeName(String(patient.name ?? ''))}_${dateText.replace(/ /g, '')}.pdf` }
}

/** Renders a payment receipt. Same null rules as the prescription. */
export async function renderReceiptPdf(tenant: Tenant, paymentId: string): Promise<RenderedPdf | null> {
  const db = tenantDb(tenant)
  const pay = await db.col('payments').doc(paymentId).get()
  if (!pay.exists) return null
  const payData = pay.data() as any

  const [apptSnap, patientSnap, doctor] = await Promise.all([
    db.col('appointments').doc(String(payData.appointmentId)).get(),
    db.col('patients').doc(String(payData.patientId)).get(),
    loadDoctor(tenant),
  ])
  if (!apptSnap.exists || !patientSnap.exists || !doctor) return null
  const appt = apptSnap.data() as any
  const patient = patientSnap.data() as any

  const paidAt: Date = payData.paidAt.toDate()
  const { logoUrl: _logo, registrationNumber: _reg, qualifications: _q, ...doctorProps } = doctor

  registerPdfFonts()
  const buffer = await renderToBuffer(
    ReceiptDocument({
      payment: {
        id: pay.id,
        amount: Number(payData.amount) || 0,
        mode: String(payData.mode ?? ''),
        paidOnText: formatDateTimeInTz(paidAt, tenant.timezone),
        paidDateText: formatDateShortInTz(paidAt, tenant.timezone),
        notes: payData.notes,
      },
      patient: { name: String(patient.name ?? ''), phone: String(patient.phone ?? '') },
      visit: { dateTimeText: formatDateTimeInTz(appt.startTime.toDate(), tenant.timezone), chiefComplaint: appt.chiefComplaint },
      doctor: doctorProps,
    }),
  )
  return { buffer, filename: `Receipt_${safeName(String(patient.name ?? ''))}_${formatDateShortInTz(paidAt, tenant.timezone).replace(/ /g, '')}.pdf` }
}
