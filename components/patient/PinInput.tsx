'use client'

interface Props {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  hint?: string
}

/** A masked 4-digit PIN field: digits only, numeric keypad on phones, never autofilled or remembered. */
export default function PinInput({ id, label, value, onChange, autoFocus, hint }: Props) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autoComplete="off"
        autoFocus={autoFocus}
        className="form-input text-center text-xl font-semibold tracking-[0.6em]"
        style={{ maxWidth: '11rem' }}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && <p id={`${id}-hint`} className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>{hint}</p>}
    </div>
  )
}
