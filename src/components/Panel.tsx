import type { HTMLAttributes } from 'react'

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`px-box px-box-lg p-2 ${className}`} {...props} />
}
