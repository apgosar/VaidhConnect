import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))

import { registerPdfFonts, scriptRuns, FONT_DEVANAGARI, FONT_GUJARATI, FONT_LATIN } from '@/lib/pdf/fonts'
import { PrescriptionDocument, type PrescriptionDocProps } from '@/lib/pdf/prescriptionDocument'
import { ReceiptDocument } from '@/lib/pdf/receiptDocument'
import { renderPrescriptionPdf, renderReceiptPdf, loadLogo } from '@/lib/modules/documents'
import { pdfResponse } from '@/lib/pdfHttp'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
// 1x1 transparent PNG
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const baseDoc = (over: Partial<PrescriptionDocProps> = {}): PrescriptionDocProps => ({
  prescription: { id: 'rx123456789', diagnosis: 'Viral fever', medicines: [{ name: 'Paracetamol', dosage: '500 mg', frequency: 'Twice daily', duration: '3 days', instructions: 'After food' }], notes: 'Rest' },
  patient: { name: 'Asha Rao', phone: '+919800000001', dob: '01 May 1990' },
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
      patient: { name: 'આશા રાવ', phone: '+919800000001', dob: '01 May 1990' },
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
