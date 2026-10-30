import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cx } from './cx'

export type AlertVariant = 'error' | 'success' | 'warning' | 'info'

const ICON = { error: AlertCircle, success: CheckCircle2, warning: AlertTriangle, info: Info } as const

/**
 * The one way to show a message about what just happened. Errors and warnings interrupt a screen
 * reader (role=alert); success and info wait their turn (role=status), so nothing is announced twice.
 * Pass the message as children, or use failureText() from lib/clientErrors for an API failure.
 */
export function Alert({ variant = 'error', children, className, id }: {
  variant?: AlertVariant
  children: React.ReactNode
  className?: string
  id?: string
}) {
  const Icon = ICON[variant]
  return (
    <div id={id} role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'} className={cx('alert', `alert-${variant}`, className)}>
      <Icon size={18} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
