// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cleanBottomNav, pickBottomNav } from '@/lib/bottomNav'
import { BottomBarSection } from '@/components/doctor/settings/BottomBarSection'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const has = (o: Partial<Record<'products' | 'services' | 'videos' | 'payment', boolean>>) => ({ products: false, services: false, videos: false, payment: false, ...o })

describe('which three buttons the bottom bar shows', () => {
  it('uses the clinic choice, whatever is filled in', () => {
    expect(pickBottomNav(['payment', 'services', 'videos'], has({ products: true })).map(b => b.key)).toEqual(['payment', 'services', 'videos'])
    expect(pickBottomNav(['payment', 'services', 'videos'], has({ payment: true })).map(b => b.enabled)).toEqual([true, false, false])
  })
  it('without a choice, shows sections with content first, then greyed-out ones to make three', () => {
    expect(pickBottomNav(null, has({ services: true, payment: true }))).toEqual([
      { key: 'services', enabled: true }, { key: 'payment', enabled: true }, { key: 'products', enabled: false },
    ])
    expect(pickBottomNav(undefined, has({}))).toHaveLength(3)
    expect(pickBottomNav(null, has({ products: true, services: true, videos: true, payment: true })).map(b => b.key)).toEqual(['products', 'services', 'videos'])
  })
  it('ignores a choice that is not exactly three real sections', () => {
    expect(cleanBottomNav(['products', 'products', 'videos'])).toBeNull()
    expect(cleanBottomNav(['products', 'nope', 'videos'])).toBeNull()
    expect(cleanBottomNav(['products', 'services', 'videos', 'payment'])).toEqual(['products', 'services', 'videos'])
    expect(cleanBottomNav('x')).toBeNull()
  })
})

describe('choosing the buttons in Settings', () => {
  it('lets the clinic choose three, then saves', async () => {
    const calls: { body: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => { calls.push({ body: String(init?.body) }); return new Response('{}', { status: 200 }) }))
    const user = userEvent.setup(); render(<BottomBarSection />)
    await user.click(screen.getByLabelText('Products'))
    await user.click(screen.getByLabelText('Services'))
    expect(calls).toHaveLength(0)
    await user.click(screen.getByLabelText('Payment'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(JSON.parse(calls[0].body)).toEqual({ bottomNav: ['products', 'services', 'payment'] })
    expect((screen.getByLabelText('Videos') as HTMLInputElement).disabled).toBe(true)
  })
})
