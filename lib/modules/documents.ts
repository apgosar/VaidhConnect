import { renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'
import { tenantDb } from '../db/tenant'
import { downloadFile } from '../storage'
import { formatDateShortInTz, formatDateTimeInTz } from '../time'
import { registerPdfFonts } from '../pdf/fonts'
import { PrescriptionDocument, type PrescriptionDocProps } from '../pdf/prescriptionDocument'
import { ReceiptDocument } from '../pdf/receiptDocument'
import { marginsOrDefault, type PdfLayout, type PrintMode } from '../pdf/layout'
import type { PdfImage } from '../pdf/common'
import type { Tenant } from '../tenant/types'
import type { Medicine } from '../constants'

export interface RenderedPdf {
  buffer: Buffer
  filename: string
  /** What a message that delivers the document needs to say about it (prescriptions only). */
  share?: { patientName: string; patientPhone: string; clinicName: string; clinicPhone: string; visitDate: string }
}

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

/** The clinic's uploaded letterhead (kept privately), or undefined when there is none or it cannot be read. */
export async function loadLetterhead(letterheadPath: unknown): Promise<PdfImage | undefined> {
  if (typeof letterheadPath !== 'string' || !letterheadPath) return undefined
  const data = await downloadFile(letterheadPath)
  if (!data) return undefined
  return { data, format: letterheadPath.endsWith('.png') ? 'png' : 'jpg' }
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
    printSettings: d.printSettings as unknown,
    letterheadPath: d.letterheadPath as string | undefined,
  }
}

type DoctorRecord = NonNullable<Awaited<ReturnType<typeof loadDoctor>>>

/** standard = the digital look (uploaded letterhead if any); preprinted = content only, spaced for paper that already has the letterhead. */
async function buildLayout(doctor: DoctorRecord, mode: PrintMode): Promise<PdfLayout> {
  const margins = marginsOrDefault(doctor.printSettings)
  if (mode === 'preprinted') return { mode, margins }
  return { mode, margins, letterhead: await loadLetterhead(doctor.letterheadPath) }
}

async function renderPrescription(doctor: DoctorRecord, mode: PrintMode, data: Omit<PrescriptionDocProps, 'doctor' | 'layout'>) {
  const { logoUrl, printSettings: _p, letterheadPath: _l, ...doctorProps } = doctor
  const [logo, layout] = await Promise.all([loadLogo(logoUrl), buildLayout(doctor, mode)])
  registerPdfFonts()
  return renderToBuffer(PrescriptionDocument({ ...data, doctor: { ...doctorProps, logo }, layout }))
}

/** Renders a saved prescription. Returns null when it, its appointment, its patient or the clinic profile is missing. */
export async function renderPrescriptionPdf(tenant: Tenant, prescriptionId: string, mode: PrintMode = 'standard'): Promise<RenderedPdf | null> {
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

  const dateText = formatDateShortInTz(appt.startTime.toDate(), tenant.timezone)
  const buffer = await renderPrescription(doctor, mode, {
    prescription: {
      id: rx.id,
      diagnosis: rxData.diagnosis,
      medicines: (rxData.medicines ?? []) as Medicine[],
      notes: rxData.notes,
      followUpText: rxData.followUpDate ? formatDateShortInTz(new Date(`${rxData.followUpDate}T00:00:00Z`), 'UTC') : undefined,
    },
    patient: {
      name: String(patient.name ?? ''),
      phone: String(patient.phone ?? ''),
      // dates of birth are stored as UTC midnight
      dob: patient.dob ? formatDateShortInTz(patient.dob.toDate(), 'UTC') : '',
    },
    visit: { dateText, chiefComplaint: appt.chiefComplaint },
  })
  return {
    buffer,
    filename: `Prescription_${safeName(String(patient.name ?? ''))}_${dateText.replace(/ /g, '')}.pdf`,
    share: {
      patientName: String(patient.name ?? ''),
      patientPhone: String(patient.phone ?? ''),
      clinicName: doctor.clinicName,
      clinicPhone: doctor.phone || doctor.clinicName,
      visitDate: dateText,
    },
  }
}

/** A made-up prescription laid out with the clinic's current print settings, to test spacing on real paper. */
export async function renderSamplePrescriptionPdf(tenant: Tenant, mode: PrintMode): Promise<RenderedPdf | null> {
  const doctor = await loadDoctor(tenant)
  if (!doctor) return null
  const buffer = await renderPrescription(doctor, mode, {
    prescription: {
      id: 'SAMPLE000',
      diagnosis: 'Sample diagnosis',
      medicines: [
        { name: 'Sample medicine A', dosage: '500 mg', frequency: 'Twice daily', duration: '5 days', instructions: 'After food' },
        { name: 'Sample tapering medicine', dosage: '', frequency: '', duration: '', taper: { steps: [
          { dose: '40 mg', frequency: 'Once daily', days: 5 },
          { dose: '20 mg', frequency: 'Once daily', days: 5 },
          { dose: '10 mg', frequency: 'Once daily', days: 5 },
        ] } },
      ],
      notes: 'This is a test page for checking spacing. It is not a real prescription.',
    },
    patient: { name: 'Sample Patient', phone: '+91 98765 43210', dob: '01 Jan 1980' },
    visit: { dateText: formatDateShortInTz(new Date(), tenant.timezone), chiefComplaint: 'Sample complaint' },
  })
  return { buffer, filename: `Print_test_${mode}.pdf` }
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
  const doctorProps = { name: doctor.name, clinicName: doctor.clinicName, address: doctor.address, phone: doctor.phone, primary: doctor.primary }

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
