import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any, session: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/tenant/resolve', () => ({ getTenant: async () => ({ clinicId: 'c1', storage: 'scoped', timezone: 'Asia/Kolkata' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => h.session }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/lib/storage', () => ({ uploadFile: vi.fn(), deleteFile: vi.fn(), tenantPath: (_t: unknown, p: string) => p }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true) }))
vi.mock('@/lib/whatsapp', () => ({
  sendBookingConfirmation: vi.fn(async () => true),
  sendCancellation: vi.fn(async () => true),
  sendRescheduled: vi.fn(async () => true),
  sendSummaryUpdate: vi.fn(async () => true),
}))

import { clinicPhones, clinicPhoneText, cleanClinicPhones, MAX_CLINIC_PHONES } from '@/lib/clinicPhones'
import { PATCH as patchProfile } from '@/app/api/doctor/profile/route'
import { notifyBooked, notifyCancelled, notifyRescheduled } from '@/lib/modules/notifications'
import { sendBookingConfirmation, sendCancellation, sendRescheduled } from '@/lib/whatsapp'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' }
const A = '+91 98765 43210', B = '+91 91234 56789'

describe('clinicPhones', () => {
  it('uses the list when there is one, otherwise the old single number, otherwise nothing', () => {
    expect(clinicPhones({ phones: [A, B], phone: '+91 1' })).toEqual([A, B])
    expect(clinicPhones({ phone: A })).toEqual([A])
    expect(clinicPhones({ phones: [], phone: A })).toEqual([A])
    expect(clinicPhones({})).toEqual([])
    expect(clinicPhones(null)).toEqual([])
  })

  it('puts every number in one line of text for a message, or the fallback when there are none', () => {
    expect(clinicPhoneText({ phones: [A, B] })).toBe(`${A}, ${B}`)
    expect(clinicPhoneText({ phone: A })).toBe(A)
    expect(clinicPhoneText({}, 'Shah Clinic')).toBe('Shah Clinic')
    expect(clinicPhoneText({ phones: [A, B] })).not.toMatch(/[\n\t]| {4}/) // safe as a WhatsApp template value
  })

  it('cleans a list: trims, drops blanks and repeats, refuses non-numbers and too many', () => {
    expect(cleanClinicPhones(['  +91  98765 43210 ', '', '+919876543210', B])).toEqual(['+91 98765 43210', B])
    expect(cleanClinicPhones([A, 'call me'])).toBeNull()
    expect(cleanClinicPhones('x')).toBeNull()
    expect(cleanClinicPhones(Array.from({ length: MAX_CLINIC_PHONES + 1 }, (_, i) => `+91 90000 0000${i}`))).toBeNull()
    expect(cleanClinicPhones([])).toEqual([])
  })
})

describe('saving the clinic numbers in Settings', () => {
  beforeEach(async () => {
    h.db = fakeTenantDb(new FakeFirestore()); h.session = { uid: 'u1', role: 'OWNER' }
    await h.db.profile().set({ name: 'Dr A', clinicName: 'C', phone: '+91 11111 11111' })
  })
  const patch = async (body: unknown) => (await patchProfile(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })))!

  it('keeps all of them, the first as the main number', async () => {
    expect((await patch({ phones: [A, '', B] })).status).toBe(200)
    expect((await h.db.profile().get()).data()).toMatchObject({ phones: [A, B], phone: A })
  })

  it('refuses a list with something that is not a phone number, and changes nothing', async () => {
    expect((await patch({ phones: [A, 'not a number'] })).status).toBe(400)
    expect((await h.db.profile().get()).data().phone).toBe('+91 11111 11111')
  })

  it('clearing every number clears the main number too', async () => {
    await patch({ phones: [A] }); await patch({ phones: [] })
    expect((await h.db.profile().get()).data()).toMatchObject({ phones: [], phone: null })
  })

  it('still works for the old single phone field', async () => {
    expect((await patch({ phone: B })).status).toBe(200)
    expect((await h.db.profile().get()).data().phone).toBe(B)
  })
})

describe('the numbers in the messages patients get', () => {
  const doctor = { id: 'c1', clinicName: 'Shah Clinic', name: 'Shah', phone: A, phones: [A, B] }
  const patient = { name: 'Asha', phone: '+919800000001' }
  const when = { startTime: new Date('2026-11-05T04:30:00Z') }

  beforeEach(() => {
    h.db = fakeTenantDb(new FakeFirestore())
    vi.mocked(sendBookingConfirmation).mockClear(); vi.mocked(sendCancellation).mockClear(); vi.mocked(sendRescheduled).mockClear()
  })

  it('the booking confirmation lists every number', async () => {
    await notifyBooked(tenant, doctor, patient, when)
    expect(vi.mocked(sendBookingConfirmation).mock.calls[0][1]).toMatchObject({ clinicPhone: `${A}, ${B}` })
  })

  it('the cancellation and the reschedule message list every number too', async () => {
    await notifyCancelled(tenant, doctor, patient, when)
    await notifyRescheduled(tenant, doctor, patient, when, new Date('2026-11-04T04:30:00Z'))
    expect(vi.mocked(sendCancellation).mock.calls[0][1]).toMatchObject({ clinicPhone: `${A}, ${B}` })
    expect(vi.mocked(sendRescheduled).mock.calls[0][1]).toMatchObject({ clinicPhone: `${A}, ${B}` })
  })

  it('a clinic with only the old single number gets the same message as before', async () => {
    await notifyBooked(tenant, { id: 'c1', clinicName: 'Shah Clinic', name: 'Shah', phone: A }, patient, when)
    expect(vi.mocked(sendBookingConfirmation).mock.calls[0][1]).toMatchObject({ clinicPhone: A })
  })

  it('a clinic with no number at all falls back to its name, as before', async () => {
    await notifyBooked(tenant, { id: 'c1', clinicName: 'Shah Clinic', name: 'Shah' }, patient, when)
    expect(vi.mocked(sendBookingConfirmation).mock.calls[0][1]).toMatchObject({ clinicPhone: 'Shah Clinic' })
  })
})
