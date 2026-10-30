import { cx } from './cx'

/**
 * The page itself: the <main> landmark that the skip link jumps to, on the clinic's background.
 * Put a PageHeader and a <Container> inside.
 */
export function PageShell({ children, className, centered }: { children: React.ReactNode; className?: string; centered?: boolean }) {
  return (
    <main id="main-content" className={cx('min-h-screen', centered && 'flex items-center justify-center p-4', className)} style={{ backgroundColor: 'var(--color-linen)' }}>
      {children}
    </main>
  )
}

/**
 * Content width. `narrow` is for forms and lists (one column that grows a little on tablets),
 * `wide` is for dashboards. Widths and padding come from the breakpoint scale in globals.css.
 */
export function Container({ children, width = 'narrow', className }: { children: React.ReactNode; width?: 'narrow' | 'wide'; className?: string }) {
  return <div className={cx(width === 'wide' ? 'container-wide' : 'container-narrow', className)}>{children}</div>
}
