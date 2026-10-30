'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { message } from '@/lib/messages'
import { useFocusTrap } from './useFocusTrap'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** A destructive action: the confirm button turns red and focus starts on Cancel. */
  danger?: boolean
}

/**
 * A confirmation dialog that replaces window.confirm(). Unlike the browser's, it can never be blocked
 * or dismissed without a trace, it matches the app, and it handles keyboard and screen readers.
 * Normally used through useConfirm().
 */
export function ConfirmDialog({ open, title, message: body, confirmLabel = message('common.confirm'), cancelLabel = message('common.cancel'), danger, onConfirm, onCancel }:
  ConfirmOptions & { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  // A destructive confirmation starts on the safe choice.
  useFocusTrap(panel, open, onCancel, danger ? cancelButton : confirmButton)
  if (!open) return null
  return (
    <div role="presentation" className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={body ? bodyId : undefined} className="modal-panel space-y-4" tabIndex={-1}>
        <h2 id={titleId} className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>{title}</h2>
        {body && <p id={bodyId} className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>{body}</p>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button ref={cancelButton} type="button" className="btn btn-outline" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmButton} type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * const { confirm, dialog } = useConfirm()
 * if (!(await confirm({ title: 'Remove this slot?', danger: true }))) return
 * ...and render {dialog} once in the component.
 */
export function useConfirm() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setState({ options, resolve })), [])
  const settle = (ok: boolean) => { state?.resolve(ok); setState(null) }

  const dialog = state ? <ConfirmDialog open {...state.options} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null
  return { confirm, dialog }
}

