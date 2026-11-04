// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ShowcaseGallery } from '@/components/patient/ShowcaseGallery'
import { ShowcaseSection } from '@/components/doctor/settings/ShowcaseSection'
import type { PublicShowcaseItem, ShowcaseItem } from '@/lib/showcase'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const PDF: PublicShowcaseItem = { id: 'p', kind: 'pdf', title: 'Our treatments', url: 'https://f.example/file.pdf', pages: ['https://f.example/p1.jpg', 'https://f.example/p2.jpg', 'https://f.example/p3.jpg'], bytes: 2 * 1024 * 1024 }
const IMG: PublicShowcaseItem = { id: 'i', kind: 'image', title: 'Waiting room', url: 'https://f.example/i.jpg', bytes: 50 * 1024 }

describe('the gallery on the public page', () => {
  it('shows nothing when there is nothing', () => {
    const { container } = render(<ShowcaseGallery items={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows each PDF as a swipeable gallery: the pages side by side, one at a time, never one long scroll', () => {
    render(<ShowcaseGallery items={[PDF, IMG]} />)
    expect(screen.getByRole('heading', { name: 'Our Services' })).toBeTruthy()
    const pdf = screen.getByRole('region', { name: 'Our treatments' })
    const track = within(pdf).getByRole('group')
    expect(track.className).toContain('snap-x')
    expect(track.className).toContain('overflow-x-auto')
    expect(Array.from(track.querySelectorAll('img')).map(i => i.getAttribute('src'))).toEqual(PDF.pages)
    expect(within(pdf).getByText('Page 1 of 3')).toBeTruthy()
    // a picture is a single slide with no page controls
    const pic = screen.getByRole('region', { name: 'Waiting room' })
    expect(within(pic).getAllByRole('button')).toHaveLength(1)
    expect(within(pic).queryByRole('button', { name: 'Next page' })).toBeNull()
    const download = within(pdf).getByRole('link', { name: /Download PDF/ })
    expect(download.getAttribute('href')).toBe('https://f.example/file.pdf')
    expect(download.getAttribute('rel')).toContain('noopener')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves between pages with the arrows', async () => {
    const user = userEvent.setup(); render(<ShowcaseGallery items={[PDF]} />)
    const pdf = screen.getByRole('region', { name: 'Our treatments' })
    expect((within(pdf).getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(pdf).getByRole('button', { name: 'Next page' }))
    expect(within(pdf).getByText('Page 2 of 3')).toBeTruthy()
    await user.click(within(pdf).getByRole('button', { name: 'Next page' }))
    expect((within(pdf).getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens the tapped page to look closer, and steps through the pages', async () => {
    const user = userEvent.setup(); render(<ShowcaseGallery items={[PDF]} />)
    await user.click(screen.getByRole('button', { name: /page 2 of 3\. Tap/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Page 2 of 3')).toBeTruthy()
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe('https://f.example/p2.jpg')
    await user.click(within(dialog).getByRole('button', { name: 'Next page' }))
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe('https://f.example/p3.jpg')
    expect((within(dialog).getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('zooms a picture in steps', async () => {
    const user = userEvent.setup(); render(<ShowcaseGallery items={[IMG]} />)
    await user.click(screen.getByRole('button', { name: /Waiting room/ }))
    const dialog = screen.getByRole('dialog')
    const img = within(dialog).getByRole('img')
    expect(img.style.width).toBe('100%')
    await user.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    expect(img.style.width).toBe('150%')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the Settings section', () => {
  const item = (id: string, title: string): ShowcaseItem => ({ id, kind: 'image', title, url: `https://f.example/${id}.jpg`, bytes: 1024, createdAt: 'x' })
  const stub = (list: ShowcaseItem[]) => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'DELETE') list = list.filter(i => !url.endsWith(i.id))
      if (init?.method === 'PATCH') { const b = JSON.parse(String(init.body)); if (b.order) list = b.order.map((id: string) => list.find(i => i.id === id)!) }
      return new Response(JSON.stringify({ items: list }), { status: 200 })
    }))
    return calls
  }

  it('lists the items and moves one up', async () => {
    const calls = stub([item('a', 'First'), item('b', 'Second')]); const user = userEvent.setup()
    render(<ShowcaseSection />)
    await screen.findByLabelText('Title of First')
    expect((screen.getByRole('button', { name: 'Move First up' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Move Second up' }))
    await waitFor(() => expect(calls.some(c => c.init?.method === 'PATCH' && JSON.parse(String(c.init.body)).order?.join() === 'b,a')).toBe(true))
  })

  it('asks before removing, and removes on yes', async () => {
    const calls = stub([item('a', 'First')]); const user = userEvent.setup()
    render(<ShowcaseSection />)
    await user.click(await screen.findByRole('button', { name: 'Remove First' }))
    expect(calls.some(c => c.init?.method === 'DELETE')).toBe(false)
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(calls.some(c => c.init?.method === 'DELETE' && c.url.endsWith('/a'))).toBe(true))
    await screen.findByText('Nothing added yet.')
  })

  it('uploads the chosen file with its title', async () => {
    const calls = stub([]); const user = userEvent.setup()
    render(<ShowcaseSection />)
    await screen.findByText('Nothing added yet.')
    await user.type(screen.getByLabelText('Title (optional)'), 'Brochure')
    await user.upload(screen.getByLabelText('Choose a PDF or picture'), new File(['%PDF-1.4'], 'b.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(calls.some(c => c.init?.method === 'POST')).toBe(true))
    const fd = calls.find(c => c.init?.method === 'POST')!.init!.body as FormData
    expect(fd.get('title')).toBe('Brochure'); expect((fd.get('file') as File).name).toBe('b.pdf')
  })
})
