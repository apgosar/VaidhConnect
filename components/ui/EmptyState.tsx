import { cx } from './cx'

/** "Nothing here yet", with an optional next step. */
export function EmptyState({ icon, title, hint, action, className }: {
  icon?: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('card p-8 text-center', className)}>
      {icon && <div className="mx-auto mb-3 flex justify-center" style={{ color: 'var(--color-sage-light)' }} aria-hidden="true">{icon}</div>}
      <p className="font-medium" style={{ color: 'var(--color-sage)' }}>{title}</p>
      {hint && <p className="text-sm mt-1" style={{ color: 'var(--color-sage)' }}>{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
