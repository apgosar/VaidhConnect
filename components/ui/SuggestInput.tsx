'use client'

import { useId, useState } from 'react'

export interface Suggestion { key: string; primary: string; secondary?: string }

/**
 * A text box that offers matches in a dropdown as you type. It follows the standard combobox pattern, so it
 * works with a keyboard (Up/Down to move, Enter to choose, Escape to close) and with a screen reader.
 * The page decides what the matches are; this only shows them and reports the one picked.
 */
export function SuggestInput({ id, suggestions, onPick, listLabel, className, onKeyDown, onFocus, onBlur, ...input }: {
  /** Required: the id a <label htmlFor> points at, so the box always has a name. */
  id: string
  suggestions: Suggestion[]
  onPick: (key: string) => void
  /** What the list is called for a screen reader, e.g. "Matching patients". */
  listLabel: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'role'>) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const showing = open && suggestions.length > 0
  const pick = (key: string) => { setOpen(false); setActive(-1); onPick(key) }

  return (
    <div className="relative">
      <input
        {...input}
        id={id}
        className={className}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onFocus={e => { setOpen(true); onFocus?.(e) }}
        onBlur={e => { setOpen(false); setActive(-1); onBlur?.(e) }}
        onChange={e => { setOpen(true); setActive(-1); input.onChange?.(e) }}
        onKeyDown={e => {
          if (showing && e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length) }
          else if (showing && e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1)) }
          else if (showing && e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active].key) }
          else if (e.key === 'Escape' && open) { setOpen(false) }
          onKeyDown?.(e)
        }}
      />
      {showing && (
        // onMouseDown (not onClick): it runs before the box loses focus, which would close the list first.
        <ul id={listId} role="listbox" aria-label={listLabel} className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-white shadow-lg" style={{ borderColor: 'var(--color-sage-border)' }}>
          {suggestions.map((s, i) => (
            <li
              key={s.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(s.key) }}
              onMouseEnter={() => setActive(i)}
              className="px-3 py-2.5 cursor-pointer flex flex-wrap items-baseline justify-between gap-x-3"
              style={{ background: i === active ? 'var(--color-primary-bg)' : undefined }}
            >
              <span className="font-medium" style={{ color: 'var(--color-charcoal)' }}>{s.primary}</span>
              {s.secondary && <span className="text-xs" style={{ color: 'var(--color-sage)' }}>{s.secondary}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
