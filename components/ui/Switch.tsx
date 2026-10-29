'use client'

import { cx } from './cx'

/**
 * An on/off switch that works with keyboard and screen readers: a real button with role="switch",
 * reachable with Tab and toggled with Space or Enter, announced as "<name>, switch, on/off".
 *
 * Wrap it in a <label> with the setting's text to name it, or pass `label` for an invisible name.
 */
export function Switch({ checked, onChange, label, disabled, className }: {
  checked: boolean
  onChange: (next: boolean) => void
  /** An accessible name for when there is no wrapping <label>. */
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-blue-600' : 'bg-slate-300', className)}
      style={{ width: 44, height: 24 }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform"
        style={{ width: 20, height: 20, transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}
