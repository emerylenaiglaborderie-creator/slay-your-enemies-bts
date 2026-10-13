import type { ReactNode } from 'react'

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}

export function Notice({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="status" className="px-box px-flat bg-success-tint p-1 text-sm [--frame:var(--color-success)]">
      {children}
    </p>
  )
}
