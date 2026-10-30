import { message } from '@/lib/messages'
import { cx } from './cx'

/** A small spinner with an accessible name. */
export function Spinner({ className, label = message('common.loading') }: { className?: string; label?: string }) {
  return <div className={cx('spinner', className)} role="status" aria-label={label} />
}

/** A centred spinner for a section that is still loading. */
export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center justify-center py-16', className)} style={{ color: 'var(--color-sage)' }}>
      <Spinner label={label} />
    </div>
  )
}
