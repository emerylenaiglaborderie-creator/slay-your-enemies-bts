const SEGMENTS = 10

type Props = { value: number; max: number; color: string; label: string }

/** Barre de progression en segments carrés, à la couleur de la matière. */
export function PixelProgress({ value, max, color, label }: Props) {
  const filled = max > 0 ? Math.round((value / max) * SEGMENTS) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="flex gap-0.5">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="size-1 shadow-[0_2px_0_0_var(--color-outline)]"
          style={{ background: i < filled ? color : 'var(--color-surface-2)' }}
        />
      ))}
    </div>
  )
}
