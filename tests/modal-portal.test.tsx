// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { Modal } from '@/components/ui/Modal'

afterEach(cleanup)

describe('Modal', () => {
  it('sits on the page body, outside an animated wrapper that would otherwise hold it off-screen', () => {
    const { container } = render(<div className="animate-fade-in"><Modal open title="Edit appointment" onClose={() => {}}><p>Body</p></Modal></div>)
    const dialog = screen.getByRole('dialog')
    expect(container.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
  })
})
