import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeFirestore, fakeTenantDb } from './helpers/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db/tenant', () => ({ tenantDb: () => h.db }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true) }))
vi.mock('@/lib/whatsapp', () => ({
  sendBookingConfirmation: vi.fn(async () => true),
  sendCancellation: vi.fn(async () => true),
  sendRescheduled: vi.fn(async () => true),
  sendSummaryUpdate: vi.fn(async () => true),
}))

import { notifyDoctorScheduleUpdate } from '@/lib/modules/notifications'
import { sendSummaryUpdate } from '@/lib/whatsapp'

const tenant = { clinicId: 'c1', storage: 'scoped' as const, timezone: 'Asia/Kolkata' } as any
const doctor = { id: 'd1', name: 'Sheth', clinicName: 'C', summaryHour: 10, whatsappPhone: '+919800000000' } as any
// 23 Nov 2026, times in IST (UTC+5:30)
const ist = (hh: number, mm: number) => new Date(Date.UTC(2026, 10, 23, hh - 5, mm - 30))

describe('doctor schedule update', () => {
  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(ist(16, 44))
    h.db = fakeTenantDb(new FakeFirestore())
    vi.mocked(sendSummaryUpdate).mockClear()
    const add = async (id: string, name: string, when: Date) => {
      await h.db.col('patients').doc(id).set({ name, phone: '+91 9' + id })
      await h.db.col('appointments').add({ doctorId: 'd1', patientId: id, status: 'BOOKED', startTime: when })
    }
    await add('1', 'Done Morning', ist(12, 30))
    await add('2', 'Done Afternoon', ist(13, 0))
    await add('3', 'Later Today', ist(20, 45))
  })
  afterEach(() => vi.useRealTimers())

  it('lists and counts only the appointments still ahead', async () => {
    await notifyDoctorScheduleUpdate(tenant, doctor, { startTime: ist(20, 45) } as any, 'New booking')
    const p = vi.mocked(sendSummaryUpdate).mock.calls[0][1]
    expect(p.totalCount).toBe('1')
    expect(p.scheduleList).toContain('Later Today')
    expect(p.scheduleList).not.toContain('Done')
  })

  it('says there is nothing left when everything is done', async () => {
    vi.setSystemTime(ist(21, 30))
    await notifyDoctorScheduleUpdate(tenant, doctor, { startTime: ist(21, 40) } as any, 'Cancellation')
    const p = vi.mocked(sendSummaryUpdate).mock.calls[0][1]
    expect(p.totalCount).toBe('0')
    expect(p.scheduleList).toBe('No remaining appointments.')
  })
})
