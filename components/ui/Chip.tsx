'use client'

import { cx } from './cx'

/** A one-tap choice. `selected` makes it a toggle (announced as pressed); leave it out for a plain shortcut button. */
export function Chip({ children, selected, onClick, tone = 'neutral', className }: {
  children: React.ReactNode
  selected?: boolean
  onClick: () => void
  tone?: 'neutral' | 'danger'
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors',
        selected ? 'border-blue-600 bg-blue-600 text-white' : tone === 'danger' ? 'border-red-200 bg-white text-red-600' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        className,
      )}
      style={{ minHeight: 36 }}
    >
      {children}
    </button>
  )
}

/** A single line of chips that scrolls sideways on a narrow screen instead of taking up several lines. */
export function ChipRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-1.5">
      {children}
    </div>
  )
}
