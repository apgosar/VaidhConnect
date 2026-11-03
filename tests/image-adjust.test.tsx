// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ImageAdjustDialog, drawAdjusted } from '@/components/ui/ImageAdjustDialog'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const ctx = () => ({
  clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), fillStyle: '',
})

describe('drawAdjusted', () => {
  const img = { naturalWidth: 400, naturalHeight: 200 }
  it('fit shows the whole picture, fill covers the square', () => {
    const a = ctx(); drawAdjusted(a as any, 100, img as any, { zoom: 1, x: 0, y: 0, turns: 0 }, 'fit')
    expect(a.scale).toHaveBeenCalledWith(0.25, 0.25) // 400px wide into 100px
    const b = ctx(); drawAdjusted(b as any, 100, img as any, { zoom: 1, x: 0, y: 0, turns: 0 }, 'fill')
    expect(b.scale).toHaveBeenCalledWith(0.5, 0.5) // 200px tall into 100px, wide part cut
  })
  it('turning sideways swaps the sides it fits to, and zoom and position are applied', () => {
    const a = ctx(); drawAdjusted(a as any, 100, img as any, { zoom: 2, x: 0.1, y: -0.2, turns: 1 }, 'fit')
    expect(a.scale).toHaveBeenCalledWith(0.5, 0.5) // 200 by 400 once turned: fits at 0.25, zoom 2
    expect(a.translate).toHaveBeenCalledWith(60, 30)
    expect(a.rotate).toHaveBeenCalledWith(Math.PI / 2)
  })
})

describe('ImageAdjustDialog', () => {
  beforeEach(() => {
    class FakeImage { naturalWidth = 300; naturalHeight = 300; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_: string) { queueMicrotask(() => this.onload?.()) } }
    vi.stubGlobal('Image', FakeImage)
    HTMLCanvasElement.prototype.getContext = (() => ctx()) as any
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) { cb(new Blob(['x'], { type })) }
  })

  it('hands back a PNG for a logo and a JPEG for a photo', async () => {
    const user = userEvent.setup(); const onApply = vi.fn()
    const { rerender } = render(<ImageAdjustDialog src="blob:x" title="Adjust the clinic logo" mode="fit" onCancel={() => {}} onApply={onApply} />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Use this' }) as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Use this' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(onApply.mock.calls[0][0]).toMatchObject({ name: 'logo.png', type: 'image/png' })

    rerender(<ImageAdjustDialog src="blob:y" title="Adjust the doctor photo" mode="fill" round onCancel={() => {}} onApply={onApply} />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Use this' }) as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Use this' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2))
    expect(onApply.mock.calls[1][0]).toMatchObject({ name: 'photo.jpg', type: 'image/jpeg' })
  })

  it('has zoom, turn and cancel, and shows nothing when there is no picture', async () => {
    const user = userEvent.setup(); const onCancel = vi.fn()
    const { rerender } = render(<ImageAdjustDialog src={null} title="t" mode="fit" onCancel={onCancel} onApply={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<ImageAdjustDialog src="blob:x" title="t" mode="fit" onCancel={onCancel} onApply={() => {}} />)
    for (const n of ['Zoom out', 'Zoom in', 'Turn the picture', 'Zoom']) expect(screen.getByLabelText(n)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
