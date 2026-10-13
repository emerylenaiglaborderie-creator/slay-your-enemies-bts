import type { ReactNode } from 'react'
import type { PixelIconName } from '../assets/pixel/icons'
import { t } from '../i18n'
import { PixelIcon } from './PixelIcon'

/**
 * Case de liste dans l'esprit pixel : tranche colorée à gauche, vignette avec une icône,
 * titre, sous-titre et actions. `accent` colore la tranche et la vignette.
 */
export function Tile({
  icon,
  accent = 'var(--color-accent-soft)',
  title,
  subtitle,
  aside,
  children,
}: {
  icon: PixelIconName
  accent?: string
  title: ReactNode
  subtitle?: ReactNode
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <li className="px-box tile flex flex-col gap-1 bg-surface p-1.5" style={{ ['--tile' as string]: accent }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-box px-flat flex size-5 shrink-0 items-center justify-center bg-surface-2 [--frame:var(--tile)]" style={{ color: accent }}>
          <PixelIcon name={icon} scale={3} highlight="var(--color-ink)" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-ink-muted">{subtitle}</div>}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-1">{aside}</div>}
      </div>
      {children}
    </li>
  )
}

/** Bouton carré avec une icône pixel (modifier, supprimer…). */
export function IconButton({ icon, label, onClick, danger = false }: { icon: PixelIconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`px-box flex size-4 items-center justify-center bg-surface-2 transition-transform active:translate-y-[2px] ${
        danger ? 'text-danger hover:[--frame:var(--color-danger)]' : 'text-ink-muted hover:text-ink hover:[--frame:var(--color-accent-soft)]'
      }`}
    >
      <PixelIcon name={icon} scale={2} highlight="currentColor" />
    </button>
  )
}

const DIFFICULTY_LEVEL = { easy: 1, medium: 2, hard: 3 } as const

/** Difficulté en crânes pixel : 1 à 3 allumés sur 3. */
export function DifficultySkulls({ difficulty, label }: { difficulty: keyof typeof DIFFICULTY_LEVEL; label: string }) {
  const level = DIFFICULTY_LEVEL[difficulty]
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" title={label} aria-label={label} role="img">
      {[1, 2, 3].map((i) => (
        <PixelIcon key={i} name="skull" scale={2} className={i <= level ? 'text-danger' : 'text-border'} />
      ))}
    </span>
  )
}

/** Pastille Publié / Brouillon. */
export function StatusChip({ published }: { published: boolean }) {
  return (
    <span
      className={`px-box px-flat px-1 text-xs font-semibold ${published ? 'bg-success-tint text-success [--frame:var(--color-success)]' : 'bg-surface-2 text-ink-muted'}`}
    >
      {published ? t.quizzes.published : t.quizzes.draft}
    </span>
  )
}
