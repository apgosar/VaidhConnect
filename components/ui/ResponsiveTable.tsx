import { cx } from './cx'

export interface Column<Row> {
  /** Column heading; also the label shown beside each value in the phone layout. */
  label: string
  render: (row: Row) => React.ReactNode
  /** Cell classes for the table layout (e.g. 'whitespace-nowrap'). */
  className?: string
  /** Hide this column in the phone layout (when it only repeats what the card already shows). */
  hideOnCard?: boolean
}

/**
 * Tabular data that stays readable at any width: a real <table> from 768px up, and below that
 * each row becomes a card with "label: value" lines, so nothing scrolls sideways on a phone.
 * Renders as server or client component; it only needs the rows and column definitions.
 */
export function ResponsiveTable<Row>({ columns, rows, rowKey, caption, empty = 'Nothing here yet.', className }: {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string | number
  /** Describes the table to screen readers (visually hidden). */
  caption?: string
  empty?: string
  className?: string
}) {
  if (rows.length === 0) {
    return <div className={cx('card px-4 py-8 text-center', className)} style={{ color: 'var(--color-sage)' }}>{empty}</div>
  }
  return (
    <div className={className}>
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="text-left" style={{ color: 'var(--color-sage)' }}>
              {columns.map(c => <th key={c.label} scope="col" className="px-4 py-3 font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row, i)} style={{ borderTop: '1px solid var(--color-sage-border)' }}>
                {columns.map(c => <td key={c.label} className={cx('px-4 py-2', c.className)}>{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden space-y-3" aria-label={caption}>
        {rows.map((row, i) => (
          <li key={rowKey(row, i)} className="card p-4 space-y-1.5 text-sm">
            {columns.filter(c => !c.hideOnCard).map(c => (
              <div key={c.label} className="flex justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide shrink-0" style={{ color: 'var(--color-sage)' }}>{c.label}</span>
                <span className="text-right min-w-0 break-words">{c.render(row)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
