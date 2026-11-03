import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, lastRx: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/storage', () => ({ downloadFile: async () => null }))
// Remember what the PDF was built from, so a test can check the wording that goes on the page.
vi.mock('@/lib/pdf/prescriptionDocument', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/pdf/prescriptionDocument')>()
  return { ...real, PrescriptionDocument: (props: any) => { h.lastRx = props; return real.PrescriptionDocument(props) } }
})

import { registerPdfFonts, scriptRuns, FONT_DEVANAGARI, FONT_GUJARATI, FONT_LATIN } from '@/lib/pdf/fonts'
import { PrescriptionDocument, type PrescriptionDocProps } from '@/lib/pdf/prescriptionDocument'
import { ReceiptDocument } from '@/lib/pdf/receiptDocument'
import { renderPrescriptionPdf, renderReceiptPdf, renderSamplePrescriptionPdf, loadLogo } from '@/lib/modules/documents'
import { pdfResponse } from '@/lib/pdfHttp'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
// 1x1 transparent PNG
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const baseDoc = (over: Partial<PrescriptionDocProps> = {}): PrescriptionDocProps => ({
  prescription: { id: 'rx123456789', diagnosis: 'Viral fever', medicines: [{ name: 'Paracetamol', dosage: '500 mg', frequency: 'Twice daily', duration: '3 days', instructions: 'After food' }], notes: 'Rest' },
  patient: { name: 'Asha Rao', phone: '+919800000001', age: '36 years' },
  visit: { dateText: '02 Nov 2026', chiefComplaint: 'Fever' },
  doctor: { name: 'Shah', clinicName: 'Shah Clinic', qualifications: 'MBBS', address: 'MG Road', phone: '+919900000000' },
  ...over,
})

const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-'
const asText = (b: Buffer) => b.toString('latin1')

beforeEach(() => registerPdfFonts())

describe('scriptRuns', () => {
  it('keeps plain English in one Latin run', () => {
    expect(scriptRuns('Paracetamol 500 mg')).toEqual([{ text: 'Paracetamol 500 mg', family: FONT_LATIN }])
  })
  it('switches font for Hindi, Gujarati and the rupee sign, leaving spaces and digits in the Latin font', () => {
    expect(scriptRuns('Dr आशा 5')).toEqual([
      { text: 'Dr ', family: FONT_LATIN },
      { text: 'आशा', family: FONT_DEVANAGARI },
      { text: ' 5', family: FONT_LATIN },
    ])
    expect(scriptRuns('આશા Rao').map(r => r.family)).toEqual([FONT_GUJARATI, FONT_LATIN])
    expect(scriptRuns('₹500').map(r => r.family)).toEqual([FONT_DEVANAGARI, FONT_LATIN])
  })
  it('handles empty text', () => {
    expect(scriptRuns('')).toEqual([])
  })
})

describe('prescription document', () => {
  it('renders a valid PDF', async () => {
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc()))
    expect(isPdf(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })

  it('renders when there is no date of birth, diagnosis, notes or logo', async () => {
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc({
      patient: { name: 'Asha Rao', phone: '+919800000001' },
      prescription: { id: 'rx1', medicines: [] },
      visit: { dateText: '02 Nov 2026' },
    })))
    expect(isPdf(buf)).toBe(true)
  })

  it('draws Gujarati and Hindi text with the bundled fonts', async () => {
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc({
      patient: { name: 'આશા રાવ', phone: '+919800000001', age: '36 years' },
      prescription: { id: 'rx1', diagnosis: 'बुखार', medicines: [{ name: 'દવા', dosage: '1', frequency: '₹', duration: '3', instructions: 'ખાધા પછી' }], notes: 'आराम करें' },
    })))
    const text = asText(buf)
    expect(text).toContain('NotoSansGujarati')
    expect(text).toContain('NotoSansDevanagari')
  })

  it('embeds the clinic logo when one is supplied', async () => {
    const data = Buffer.from(PNG_1PX, 'base64')
    const without = await renderToBuffer(PrescriptionDocument(baseDoc()))
    const withLogo = await renderToBuffer(PrescriptionDocument(baseDoc({ doctor: { ...baseDoc().doctor, logo: { data, format: 'png' } } })))
    expect(isPdf(withLogo)).toBe(true)
    expect(asText(withLogo)).toContain('/Subtype /Image')
    expect(asText(without)).not.toContain('/Subtype /Image')
  })

  it('ignores a pending registration number and a malformed brand colour', async () => {
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc({ doctor: { ...baseDoc().doctor, registrationNumber: 'Reg. No: Pending', primary: 'blue' } })))
    expect(isPdf(buf)).toBe(true)
  })

  it('paginates a long prescription without crashing', async () => {
    const medicines = Array.from({ length: 50 }, (_, i) => ({ name: `Medicine ${i + 1}`, dosage: '1 tab', frequency: 'Daily', duration: '5 days', instructions: 'x'.repeat(80) }))
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc({ prescription: { id: 'rx1', medicines } })))
    expect((asText(buf).match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
  })
})

describe('receipt document', () => {
  it('renders with the rupee sign and an unknown amount', async () => {
    const doc = {
      payment: { id: 'pay123456789', amount: 500, mode: 'UPI', paidOnText: '02 Nov 2026, 10:30 AM', paidDateText: '02 Nov 2026', notes: null },
      patient: { name: 'Asha Rao', phone: '+919800000001' },
      visit: { dateTimeText: '02 Nov 2026, 09:00 AM', chiefComplaint: null },
      doctor: { name: 'Shah', clinicName: 'Shah Clinic' },
    }
    const buf = await renderToBuffer(ReceiptDocument(doc))
    expect(isPdf(buf)).toBe(true)
    expect(asText(buf)).toContain('NotoSansDevanagari')
  })
})

// Every piece of text placed on the page, found by walking the element tree (the PDF itself stores glyphs, not words).
function textOf(node: any): string[] {
  if (node == null || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(textOf)
  return textOf(node.props?.children)
}

describe('the chief complaint on the prescription', () => {
  const words = (over: Partial<PrescriptionDocProps>) => textOf(PrescriptionDocument(baseDoc(over))).join(' ')

  it('is printed with its heading when there is one', () => {
    const t = words({ visit: { dateText: '02 Nov 2026', chiefComplaint: 'Fever for 3 days' } })
    expect(t).toContain('Chief Complaint')
    expect(t).toContain('Fever for 3 days')
  })

  it('is left out entirely, heading and all, when it is empty, missing or only spaces', () => {
    for (const blank of [null, undefined, '', '   ']) {
      const t = words({ visit: { dateText: '02 Nov 2026', chiefComplaint: blank } })
      expect(t, JSON.stringify(blank)).not.toContain('Chief Complaint')
    }
  })

  it('shows the gender next to the age, and nothing when it is not recorded', () => {
    const t = textOf(PrescriptionDocument(baseDoc({ patient: { name: 'Asha Rao', phone: '+919800000001', age: '36 years', gender: 'Female' } }))).join(' ')
    expect(t).toContain('GENDER')
    expect(t).toContain('Female')
    expect(words({})).not.toContain('GENDER')
  })

  it('shows the age, not a date of birth', () => {
    const t = words({})
    expect(t).toContain('AGE')
    expect(t).toContain('36 years')
    expect(t).not.toContain('DATE OF BIRTH')
  })
})

describe('rendering from saved data', () => {
  let fs: FakeFirestore
  beforeEach(async () => {
    fs = new FakeFirestore()
    h.db = fakeTenantDb(fs)
    await h.db.profile().set({ name: 'Shah', clinicName: 'Shah Clinic', qualifications: 'MBBS', phone: '+919900000000', registrationNumber: 'MMC 12345', theme: { primary: '#0F3D2E' }, logoUrl: `data:image/png;base64,${PNG_1PX}` })
    await h.db.col('patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001', dob: new Date('1990-05-01T00:00:00Z') })
    await h.db.col('appointments').doc('a1').set({ patientId: 'p1', startTime: new Date('2026-11-02T03:30:00Z'), chiefComplaint: 'Fever' })
    await h.db.col('prescriptions').doc('rx1').set({ appointmentId: 'a1', patientId: 'p1', diagnosis: 'Viral fever', medicines: [{ name: 'Paracetamol', dosage: '500 mg', frequency: 'BD', duration: '3 days' }], notes: null })
    await h.db.col('payments').doc('pay1').set({ appointmentId: 'a1', patientId: 'p1', amount: 500, mode: 'CASH', paidAt: new Date('2026-11-02T04:00:00Z'), notes: null })
  })

  it('builds a prescription PDF named after the patient and the visit date in the clinic timezone', async () => {
    const pdf = await renderPrescriptionPdf(tenant, 'rx1')
    expect(pdf).not.toBeNull()
    expect(isPdf(pdf!.buffer)).toBe(true)
    expect(pdf!.filename).toBe('Prescription_Asha_Rao_02Nov2026.pdf')
    expect(asText(pdf!.buffer)).toContain('/Subtype /Image') // the logo
  })

  it('puts the patient age on the prescription, worked out for the day of the visit, and never their date of birth', async () => {
    await renderPrescriptionPdf(tenant, 'rx1') // born 1 May 1990, visit 2 Nov 2026
    expect(h.lastRx.patient).toEqual({ name: 'Asha Rao', phone: '+919800000001', age: '36 years', gender: '' })
    expect(JSON.stringify(h.lastRx.patient)).not.toContain('1990')
    expect(h.lastRx.visit.chiefComplaint).toBe('Fever')
  })

  it('prints every clinic number in the header, and gives the WhatsApp message all of them', async () => {
    await h.db.profile().update({ phones: ['+91 98765 43210', '+91 91234 56789'], phone: '+91 98765 43210' })
    const pdf = await renderPrescriptionPdf(tenant, 'rx1')
    expect(h.lastRx.doctor.phone).toBe('+91 98765 43210, +91 91234 56789')
    expect(pdf!.share!.clinicPhone).toBe('+91 98765 43210, +91 91234 56789')
  })

  it('puts the patient gender on the prescription when it is recorded', async () => {
    await h.db.col('patients').doc('p1').update({ gender: 'FEMALE' })
    await renderPrescriptionPdf(tenant, 'rx1')
    expect(h.lastRx.patient.gender).toBe('Female')
  })

  it('words a baby age in months', async () => {
    await h.db.col('patients').doc('p1').set({ name: 'Baby Rao', phone: '+919800000001', dob: new Date('2026-04-02T00:00:00Z') })
    await renderPrescriptionPdf(tenant, 'rx1')
    expect(h.lastRx.patient.age).toBe('7 months')
  })

  it('builds a receipt PDF', async () => {
    const pdf = await renderReceiptPdf(tenant, 'pay1')
    expect(isPdf(pdf!.buffer)).toBe(true)
    expect(pdf!.filename).toBe('Receipt_Asha_Rao_02Nov2026.pdf')
  })

  it('returns null when anything it depends on is missing', async () => {
    expect(await renderPrescriptionPdf(tenant, 'nope')).toBeNull()
    expect(await renderReceiptPdf(tenant, 'nope')).toBeNull()
    await h.db.col('prescriptions').doc('orphan').set({ appointmentId: 'gone', patientId: 'p1', medicines: [] })
    expect(await renderPrescriptionPdf(tenant, 'orphan')).toBeNull()
  })

  it('still produces a PDF when the patient has no date of birth', async () => {
    await h.db.col('patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001' })
    expect(isPdf((await renderPrescriptionPdf(tenant, 'rx1'))!.buffer)).toBe(true)
    expect(h.lastRx.patient.age).toBe('')
  })
})

describe('loadLogo', () => {
  it('converts an uploaded image to a PNG react-pdf can embed', async () => {
    const logo = await loadLogo(`data:image/png;base64,${PNG_1PX}`)
    expect(logo?.format).toBe('png')
    expect(logo!.data.subarray(1, 4).toString()).toBe('PNG')
  })
  it('never fetches a host that is not our storage, and tolerates junk', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await loadLogo('https://evil.example.com/logo.png')).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await loadLogo('data:image/png;base64,AAAA')).toBeUndefined()
    expect(await loadLogo(undefined)).toBeUndefined()
    fetchSpy.mockRestore()
  })
})

describe('pdfResponse', () => {
  it('forces a download by default and shows inline on request, with a safe filename', () => {
    const body = Buffer.from('%PDF-1.4')
    const dl = pdfResponse(body, 'Prescription_आशा_02Nov2026.pdf')
    expect(dl.headers.get('Content-Type')).toBe('application/pdf')
    expect(dl.headers.get('Content-Disposition')).toMatch(/^attachment; filename="Prescription_[_]+_02Nov2026\.pdf"; filename\*=UTF-8''/)
    expect(dl.headers.get('Cache-Control')).toBe('no-store')
    expect(pdfResponse(body, 'a.pdf', true).headers.get('Content-Disposition')).toMatch(/^inline;/)
  })
})

describe('tapering medicines in the PDF', () => {
  const taperDoc = () => baseDoc({
    prescription: {
      id: 'rx1',
      medicines: [
        { name: 'Prednisolone', dosage: '40 mg', frequency: 'Tapering', duration: '11 days', taper: { steps: [
          { dose: '40 mg', frequency: 'Once daily', days: 5 },
          { dose: '20 mg', frequency: 'Once daily', days: 5, instructions: 'After breakfast' },
          { dose: '10 mg', frequency: 'Alternate days', days: 1 },
        ] } },
        { name: 'Paracetamol', dosage: '500 mg', frequency: 'BD', duration: '3 days' },
      ],
    },
  })

  it('renders a tapering and a fixed medicine together', async () => {
    expect(isPdf(await renderToBuffer(PrescriptionDocument(taperDoc())))).toBe(true)
  })

  it('renders a medicine with an empty tapering list as a fixed dose instead of crashing', async () => {
    const doc = baseDoc()
    doc.prescription.medicines = [{ ...doc.prescription.medicines[0], taper: { steps: [] } }]
    expect(isPdf(await renderToBuffer(PrescriptionDocument(doc)))).toBe(true)
  })
})

describe('print modes', () => {
  const letterhead = { data: Buffer.from(PNG_1PX, 'base64'), format: 'png' as const }
  const margins = { top: 50, bottom: 30, left: 20, right: 20 }

  it('standard mode draws the uploaded letterhead behind the content', async () => {
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc({ layout: { mode: 'standard', margins, letterhead } })))
    expect(asText(buf)).toContain('/Subtype /Image')
  })

  it('pre-printed mode ignores the letterhead image and the clinic logo, printing content only', async () => {
    const logoDoc = baseDoc({ doctor: { ...baseDoc().doctor, logo: letterhead }, layout: { mode: 'preprinted', margins, letterhead } })
    const buf = await renderToBuffer(PrescriptionDocument(logoDoc))
    expect(isPdf(buf)).toBe(true)
    expect(asText(buf)).not.toContain('/Subtype /Image')
  })

  it('pre-printed mode with very large margins still produces a valid PDF', async () => {
    const buf = await renderToBuffer(PrescriptionDocument(baseDoc({ layout: { mode: 'preprinted', margins: { top: 120, bottom: 100, left: 60, right: 60 } } })))
    expect(isPdf(buf)).toBe(true)
  })
})

describe('rendering modes from saved data', () => {
  it('reads the clinic spacing and ignores a missing letterhead file', async () => {
    const fs = new FakeFirestore()
    h.db = fakeTenantDb(fs)
    await h.db.profile().set({ name: 'Shah', clinicName: 'Shah Clinic', printSettings: { top: 60, bottom: 20, left: 10, right: 10 }, letterheadPath: 'letterheads/missing.png' })
    await h.db.col('patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001' })
    await h.db.col('appointments').doc('a1').set({ patientId: 'p1', startTime: new Date('2026-11-02T03:30:00Z') })
    await h.db.col('prescriptions').doc('rx1').set({ appointmentId: 'a1', patientId: 'p1', medicines: [] })
    for (const mode of ['standard', 'preprinted'] as const) {
      const pdf = await renderPrescriptionPdf(tenant, 'rx1', mode)
      expect(isPdf(pdf!.buffer)).toBe(true)
    }
    const sample = await renderSamplePrescriptionPdf(tenant, 'preprinted')
    expect(isPdf(sample!.buffer)).toBe(true)
    expect(sample!.filename).toBe('Print_test_preprinted.pdf')
  })
})

describe('follow-up in the PDF', () => {
  it('renders with and without a follow-up date', async () => {
    const withDate = baseDoc()
    withDate.prescription.followUpText = '12 Nov 2026'
    expect(isPdf(await renderToBuffer(PrescriptionDocument(withDate)))).toBe(true)
    expect(isPdf(await renderToBuffer(PrescriptionDocument(baseDoc())))).toBe(true)
  })

  it('formats the stored follow-up date as a calendar date, whatever the server timezone', async () => {
    const fs = new FakeFirestore()
    h.db = fakeTenantDb(fs)
    await h.db.profile().set({ name: 'Shah', clinicName: 'Shah Clinic' })
    await h.db.col('patients').doc('p1').set({ name: 'Asha Rao', phone: '+919800000001' })
    await h.db.col('appointments').doc('a1').set({ patientId: 'p1', startTime: new Date('2026-11-02T03:30:00Z') })
    await h.db.col('prescriptions').doc('rx1').set({ appointmentId: 'a1', patientId: 'p1', medicines: [], followUpDate: '2026-11-12' })
    expect(isPdf((await renderPrescriptionPdf(tenant, 'rx1'))!.buffer)).toBe(true)
  })
})
