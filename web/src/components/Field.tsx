import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const inputClass =
  'px-box px-flat w-full bg-surface px-1.5 py-1 text-ink placeholder:text-ink-muted focus:[--frame:var(--color-accent-soft)]'

type FieldProps = { label: string; hint?: ReactNode; error?: string }

function FieldShell({ id, label, hint, error, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, { hint, error }: FieldProps): string | undefined {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
}

export function TextField({ label, hint, error, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input id={id} className={inputClass} aria-invalid={!!error} aria-describedby={describedBy(id, { label, hint, error })} {...props} />
    </FieldShell>
  )
}

export function TextAreaField({ label, hint, error, ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea id={id} rows={3} className={inputClass} aria-invalid={!!error} aria-describedby={describedBy(id, { label, hint, error })} {...props} />
    </FieldShell>
  )
}

export function SelectField({ label, hint, error, children, ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select id={id} className={inputClass} aria-describedby={describedBy(id, { label, hint, error })} {...props}>
        {children}
      </select>
    </FieldShell>
  )
}
