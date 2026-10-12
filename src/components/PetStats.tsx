import { levelProgress } from '../domain/xp'
import { t } from '../i18n'
import { PixelIcon } from './PixelIcon'

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className="px-box px-flat [--frame:var(--color-accent-strong)] inline-flex items-center bg-accent px-1 font-pixel font-semibold text-accent-ink">
      {t.pet.level(level)}
    </span>
  )
}

export function XpBar({ xp }: { xp: number }) {
  const { current, needed } = levelProgress(xp)
  return (
    <div className="flex flex-col gap-0.5">
      <div
        role="progressbar"
        aria-label={t.pet.xpBar}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={current}
        className="px-box px-flat [--frame:var(--color-outline)] h-1.5 overflow-hidden bg-surface-2"
      >
        <div className="h-full bg-xp transition-[width] duration-500" style={{ width: `${(current / needed) * 100}%` }} />
      </div>
      <span className="text-sm text-ink-muted tabular-nums">{t.pet.xp(current, needed)}</span>
    </div>
  )
}

export function StreakBadge({ streak }: { streak: number }) {
  return (
    <span
      className={`px-box px-flat inline-flex items-center gap-0.5 px-1 text-sm font-semibold ${streak > 0 ? '[--frame:var(--color-xp)] text-xp' : 'text-ink-muted'}`}
      title={t.pet.streak(streak)}
    >
      <PixelIcon name="flame" scale={2} highlight="var(--color-ink)" />
      <span className="tabular-nums">{t.pet.streakShort(streak)}</span>
      <span className="sr-only">{t.pet.streak(streak)}</span>
    </span>
  )
}
