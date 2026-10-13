import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const base =
  'inline-flex items-center justify-center gap-1 px-2 py-1 font-semibold leading-tight transition-transform active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'px-box [--frame:var(--color-accent-strong)] bg-accent text-accent-ink hover:bg-accent-strong active:[--drop-color:transparent]',
  secondary: 'px-box bg-surface-2 text-ink hover:[--frame:var(--color-accent-soft)] active:[--drop-color:transparent]',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  danger: 'px-box [--frame:var(--color-danger)] bg-surface text-danger hover:bg-danger-tint active:[--drop-color:transparent]',
}

function buttonClass(variant: Variant = 'secondary', extra = ''): string {
  return `${base} ${variants[variant]} ${extra}`
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />
}

export function ButtonLink({ variant = 'secondary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />
}
