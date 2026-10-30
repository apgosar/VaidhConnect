import Link from 'next/link'
import { cx } from './cx'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'forest' | 'outline' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary', forest: 'btn-forest', outline: 'btn-outline', ghost: 'btn-ghost', danger: 'btn-danger', success: 'btn-success',
}
const SIZE: Record<ButtonSize, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' }

function classes(variant: ButtonVariant, size: ButtonSize, block?: boolean, className?: string) {
  return cx('btn', VARIANT[variant], SIZE[size], block && 'w-full', className)
}

/** A button. Sizes keep the 44px (small: 36px) tap target from globals.css. `loading` shows a spinner and blocks double clicks. */
export function Button({ variant = 'primary', size = 'md', block, loading, className, children, disabled, type = 'button', ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; loading?: boolean }) {
  return (
    <button type={type} className={classes(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner className="w-4 h-4" />}
      {children}
    </button>
  )
}

/** A link that looks like a button (navigation, not an action). */
export function LinkButton({ href, variant = 'primary', size = 'md', block, className, children, ...rest }:
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return <Link href={href} className={classes(variant, size, block, className)} {...rest}>{children}</Link>
}
