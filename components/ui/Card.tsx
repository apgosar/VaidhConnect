import { cx } from './cx'

/** A white panel. `padding` follows the spacing scale used across the app. */
export function Card({ children, className, padding = 'md', as: Tag = 'div' }: {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  const pad = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }[padding]
  return <Tag className={cx('card', pad, className)}>{children}</Tag>
}

/** A titled group inside a page or form (Settings sections, form steps). */
export function Section({ title, description, children, className }: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cx('card p-6 space-y-4', className)}>
      <div className="border-b border-slate-100 pb-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {description && <p className="text-sm mt-1" style={{ color: 'var(--color-sage)' }}>{description}</p>}
      </div>
      {children}
    </section>
  )
}
