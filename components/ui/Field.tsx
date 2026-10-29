'use client'

import { useId } from 'react'
import { cx } from './cx'

interface ControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
}

/**
 * A labelled form control: the label, the optional hint and the error are all wired to the control
 * (htmlFor, aria-describedby, aria-invalid), so a screen reader reads "Mobile number, required,
 * <hint>, <error>". Use the ready-made TextField / TextAreaField / SelectField, or pass a render
 * function for any other control.
 */
export function Field({ label, hint, error, required, optionalText, className, children }: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  /** Shown after the label for optional fields, e.g. "(optional)". */
  optionalText?: string
  className?: string
  children: (control: ControlProps) => React.ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('form-group', className)}>
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="text-red-600"> *</span>}
        {optionalText && <span className="font-normal normal-case" style={{ color: 'var(--color-sage)' }}> {optionalText}</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true as const } : {}), ...(required ? { 'aria-required': true as const } : {}) })}
      {hint && <p id={hintId} className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>{hint}</p>}
      {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
    </div>
  )
}

type FieldBase = { label: string; hint?: string; error?: string | null; optionalText?: string; fieldClassName?: string }

export function TextField({ label, hint, error, optionalText, fieldClassName, required, className, ...input }:
  FieldBase & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optionalText={optionalText} className={fieldClassName}>
      {control => <input className={cx('form-input', className)} required={required} {...control} {...input} />}
    </Field>
  )
}

export function TextAreaField({ label, hint, error, optionalText, fieldClassName, required, className, ...input }:
  FieldBase & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optionalText={optionalText} className={fieldClassName}>
      {control => <textarea className={cx('form-textarea', className)} required={required} {...control} {...input} />}
    </Field>
  )
}

export function SelectField({ label, hint, error, optionalText, fieldClassName, required, className, children, ...input }:
  FieldBase & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optionalText={optionalText} className={fieldClassName}>
      {control => <select className={cx('form-select', className)} required={required} {...control} {...input}>{children}</select>}
    </Field>
  )
}
