import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456'
  return {
    db: null as any,
    session: null as any,
    pdf: null as any,
    uploads: [] as string[],
  }
})

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => tenant }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/lib/storage', () => ({
  uploadFile: vi.fn(async (_b: Buffer, path: string) => { h.uploads.push(path); return path }),
  getSignedDownloadUrl: vi.fn(async (path: string, minutes: number) => `https://storage.googleapis.com/b/${path}?exp=${minutes}`),
  tenantPath: (t: any, p: string) => `clinics/${t.clinicId}/${p}`,
  downloadFile: async () => null,
}))
vi.mock('@/lib/modules/documents', () => ({ renderPrescriptionPdf: async () => h.pdf }))

import { POST } from '@/app/api/prescriptions/[id]/whatsapp/route'
import { audit } from '@/lib/audit'
import { sendPrescription } from '@/lib/whatsapp'

const call = (id = 'rx1') => POST(new Request('http://x/api/prescriptions/rx1/whatsapp', { method: 'POST' }), { params: Promise.resolve({ id }) })
const goodPdf = () => ({
  buffer: Buffer.from('%PDF-1.4'), filename: 'Prescription_Asha_Rao_02Nov2026.pdf',
  share: { patientName: 'Asha Rao', patientPhone: '+919800000001', clinicName: 'Shah Clinic', clinicPhone: '+919900000000', visitDate: '02 Nov 2026' },
})
const details = { patientName: 'Asha Rao', clinicName: 'Shah Clinic', visitDate: '02 Nov 2026', clinicPhone: '+919900000000', pdfUrl: 'https://storage.googleapis.com/b/rx.pdf?sig=1', filename: 'Prescription.pdf' }

describe('sendPrescription (WhatsApp payload)', () => {
  let sent: any[]
  beforeEach(() => {
    h.db = fakeTenantDb(new FakeFirestore())
    sent = []
  })
  const stubFetch = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(body), { status }) }))

  it('sends the PDF as a document header and the four details as the body, in order', async () => {
    stubFetch(200, { messages: [{ id: 'wamid.1' }] })
    const r = await sendPrescription('+919800000001', details)
    expect(r).toEqual({ ok: true })
    const msg = sent[0]
    expect(msg.to).toBe('919800000001')
    expect(msg.template.name).toBe('prescription_share')
    expect(msg.template.language).toEqual({ code: 'en' })
    expect(msg.template.components[0]).toEqual({ type: 'header', parameters: [{ type: 'document', document: { link: details.pdfUrl, filename: 'Prescription.pdf' } }] })
    expect(msg.template.components[1].parameters.map((p: any) => p.text)).toEqual(['Asha Rao', 'Shah Clinic', '02 Nov 2026', '+919900000000'])
  })

  it('logs the message with only its text parameters and a readable preview, never the signed link', async () => {
    stubFetch(200, { messages: [{ id: 'wamid.1' }] })
    await sendPrescription('+919800000001', details)
    const logs = (await h.db.col('whatsapp_logs').get()).docs.map((d: any) => d.data())
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ templateName: 'prescription_share', messageType: 'Prescription', status: 'sent', recipientName: 'Asha Rao' })
    expect(logs[0].params).toEqual(['Asha Rao', 'Shah Clinic', '02 Nov 2026', '+919900000000'])
    expect(logs[0].messageBody).toContain('here is your prescription from Shah Clinic')
    expect(JSON.stringify(logs[0])).not.toContain('sig=1')
  })

  it('flattens newlines in the text variables but leaves the document link alone', async () => {
    stubFetch(200, { messages: [{ id: 'wamid.1' }] })
    await sendPrescription('+919800000001', { ...details, patientName: 'Asha\nRao', pdfUrl: 'https://storage.googleapis.com/b/a%0Ab.pdf' })
    expect(sent[0].template.components[1].parameters[0].text).toBe('Asha | Rao')
    expect(sent[0].template.components[0].parameters[0].document.link).toBe('https://storage.googleapis.com/b/a%0Ab.pdf')
  })

  it("reports Meta's reason when it refuses, and logs the failure", async () => {
    stubFetch(400, { error: { message: '(#132001) Template name does not exist in the translation', code: 132001 } })
    const r = await sendPrescription('+919800000001', details)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Template name does not exist')
    const logs = (await h.db.col('whatsapp_logs').get()).docs.map((d: any) => d.data())
    expect(logs[0].status).toBe('failed')
  })

  it('says so when WhatsApp cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await sendPrescription('+919800000001', details)).toEqual({ ok: false, error: 'Could not reach WhatsApp. Please try again.' })
  })
})

describe('POST /api/prescriptions/[id]/whatsapp', () => {
  beforeEach(() => {
    h.db = fakeTenantDb(new FakeFirestore())
    h.session = { uid: 'u1', role: 'DOCTOR' }
    h.pdf = goodPdf()
    h.uploads.length = 0
    vi.mocked(audit).mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })))
  })

  it('needs a login and the prescriptions permission', async () => {
    h.session = null
    expect((await call()).status).toBe(401)
    h.session = { uid: 'u2', role: 'STAFF' }
    expect((await call()).status).toBe(403)
    expect(h.uploads).toHaveLength(0)
  })

  it('stores the PDF privately under shares/<clinic>/, sends a short-lived link and answers with a masked number', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.to).toBe('+91********01')
    expect(h.uploads[0]).toMatch(/^shares\/c1\/rx1\/\d+\.pdf$/)
    const sentBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body)
    expect(sentBody.template.components[0].parameters[0].document.link).toContain('exp=60')
    expect(audit).toHaveBeenCalledWith(tenant, h.session, 'prescription.share', 'prescriptions/rx1')
  })

  it('does not leak the signed link or the full number in its answer', async () => {
    const text = await (await call()).text()
    expect(text).not.toContain('storage.googleapis.com')
    expect(text).not.toContain('9800000001')
  })

  it('404s for a prescription that is not there', async () => {
    h.pdf = null
    expect((await call()).status).toBe(404)
  })

  it('refuses a patient without a usable WhatsApp number, before storing anything', async () => {
    h.pdf = { ...goodPdf(), share: { ...goodPdf().share, patientPhone: '98000' } }
    const res = await call()
    expect(res.status).toBe(422)
    expect(h.uploads).toHaveLength(0)
  })

  it("passes on WhatsApp's reason when sending fails", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: '(#131030) Recipient phone number not in allowed list' } }), { status: 400 })))
    const res = await call()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('not in allowed list')
    expect(audit).toHaveBeenCalledWith(tenant, h.session, 'prescription.share_failed', 'prescriptions/rx1')
  })

  it('allows five sends an hour for one prescription, then stops', async () => {
    for (let i = 0; i < 5; i++) expect((await call()).status).toBe(200)
    expect((await call()).status).toBe(429)
    expect((await call('rx2')).status).toBe(200) // another prescription is unaffected
  })
})
