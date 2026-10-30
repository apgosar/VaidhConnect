'use client'

import { useId, useRef } from 'react'
import { X } from 'lucide-react'
import { message } from '@/lib/messages'
import { cx } from './cx'
import { useFocusTrap } from './useFocusTrap'

/**
 * A dialog on top of the page. Keyboard and screen-reader behaviour comes with it: focus moves in and is
 * trapped, Escape and a click outside close it, the page behind does not scroll, and focus returns to what
 * opened it. `role="alertdialog"` is for a question that needs an answer (see ConfirmDialog); the default
 * `dialog` is for a task (picking a new time).
 */
export function Modal({ open, title, onClose, children, role = 'dialog', size = 'md', initialFocus, closeLabel = message('common.close'), describedBy }: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  role?: 'dialog' | 'alertdialog'
  size?: 'md' | 'lg'
  /** Element to focus first; defaults to the first focusable thing inside. */
  initialFocus?: React.RefObject<HTMLElement | null>
  closeLabel?: string
  describedBy?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(panel, open, onClose, initialFocus)
  if (!open) return null
  return (
    <div role="presentation" className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={panel} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} tabIndex={-1}
        className={cx('modal-panel space-y-4', size === 'lg' && 'modal-panel-lg')}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm -mr-2 -mt-1" aria-label={closeLabel}><X size={18} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
