import { useCallback, useState } from 'react'
import type { ReviewResult } from '../../domain/types'
import { useKeydown } from '../../hooks/useKeydown'
import { t } from '../../i18n'

const RESULTS: ReviewResult[] = ['again', 'hard', 'good', 'easy']

const tone: Record<ReviewResult, string> = {
  again: '[--frame:var(--color-danger)] bg-danger-tint',
  hard: '[--frame:var(--color-warning)] bg-warning-tint',
  good: '[--frame:var(--color-success)] bg-success-tint',
  easy: '[--frame:var(--color-accent-soft)] bg-accent-tint',
}

type Props = {
  onRate(result: ReviewResult): Promise<void>
  /** Résultat proposé après une correction automatique ; reçoit le focus. */
  suggested?: ReviewResult
}

export function RatingButtons({ onRate, suggested }: Props) {
  const [pending, setPending] = useState(false)

  const rate = useCallback(
    async (result: ReviewResult) => {
      if (pending) return
      setPending(true)
      await onRate(result)
    },
    [onRate, pending],
  )

  useKeydown(
    useCallback(
      (event: KeyboardEvent) => {
        const index = ['1', '2', '3', '4'].indexOf(event.key)
        if (index >= 0) {
          event.preventDefault()
          void rate(RESULTS[index])
        }
      },
      [rate],
    ),
  )

  return (
    <div role="group" aria-label={t.review.howWasIt} className="flex flex-col gap-1">
      <p className="text-center text-sm font-semibold text-ink-muted">{t.review.howWasIt}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {RESULTS.map((result, i) => (
          <button
            key={result}
            type="button"
            autoFocus={result === suggested}
            disabled={pending}
            onClick={() => void rate(result)}
            className={`px-box flex flex-col items-center px-1 py-1 font-semibold text-ink transition-transform active:translate-y-[2px] active:[--drop-color:transparent] disabled:opacity-60 ${tone[result]} ${
              result === suggested ? 'outline-3 outline-offset-5 outline-accent-soft' : ''
            }`}
          >
            <span>{t.review.results[result]}</span>
            <kbd className="text-xs text-ink-muted tabular-nums">{i + 1}</kbd>
          </button>
        ))}
      </div>
    </div>
  )
}
