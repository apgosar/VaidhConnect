import { cx } from './cx'

export type BadgeTone = 'green' | 'blue' | 'amber' | 'red' | 'gray'

/** A small status label. Always carries text, so meaning never depends on colour alone. */
export function Badge({ tone = 'gray', children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return <span className={cx('badge', `badge-${tone}`, className)}>{children}</span>
}

const APPOINTMENT_TONE: Record<string, BadgeTone> = { BOOKED: 'blue', COMPLETED: 'green', CANCELLED: 'red', NO_SHOW: 'amber' }

/** An appointment's status, in the same colours everywhere. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={APPOINTMENT_TONE[status] ?? 'gray'}>{status.replace('_', ' ')}</Badge>
}
