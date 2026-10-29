'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { message } from '@/lib/messages'
import { cx } from './cx'

/**
 * The green bar at the top of patient pages: a clearly labelled way back, the page title, an optional
 * subtitle and an optional control on the right (e.g. Sign out).
 *
 * The way back is "Home" by default. Pass `onBack` for a step inside a flow (it shows "Back" and runs
 * your function), or `homeHref={null}` for a page with nowhere to go back to.
 */
export function PageHeader({ title, subtitle, homeHref = '/', onBack, right, className }: {
  title: string
  subtitle?: React.ReactNode
  homeHref?: string | null
  onBack?: () => void
  right?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cx('page-header', className)}>
      {onBack ? (
        <button type="button" onClick={onBack} className="btn btn-sm header-home font-semibold">
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
      ) : homeHref ? (
        <Link href={homeHref} className="btn btn-sm header-home font-semibold" aria-label={message('common.backToHome')}>
          <ArrowLeft size={16} aria-hidden="true" /> {message('common.home')}
        </Link>
      ) : null}
      <div className="flex-1 min-w-0">
        <h1 className="font-bold text-white text-base truncate" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
        {subtitle && <p className="text-xs" style={{ color: '#FFFFFF' }}>{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}
