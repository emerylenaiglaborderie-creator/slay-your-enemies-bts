import { useCallback, useMemo, useState } from 'react'
import { shuffleWithSeed } from '../../domain/cards'
import type { Card, ReviewResult } from '../../domain/types'
import { useKeydown } from '../../hooks/useKeydown'
import { t } from '../../i18n'
import { RatingButtons } from './RatingButtons'

type Props = { card: Card; seed: string; onRate(result: ReviewResult): Promise<void> }

export function QuizReview({ card, seed, onRate }: Props) {
  const options = useMemo(() => shuffleWithSeed([card.back, ...(card.choices ?? [])], card.id + seed), [card, seed])
  const [picked, setPicked] = useState<number | null>(null)
  const answered = picked !== null
  const correct = answered && options[picked] === card.back

  useKeydown(
    useCallback(
      (event: KeyboardEvent) => {
        const index = Number(event.key) - 1
        if (Number.isInteger(index) && index >= 0 && index < options.length) {
          event.preventDefault()
          setPicked(index)
        }
      },
      [options.length],
    ),
    !answered,
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="px-box px-box-lg flex flex-col gap-2 p-3">
        <p className="text-xl font-semibold whitespace-pre-wrap">{card.front}</p>
        <ul className="flex flex-col gap-1">
          {options.map((option, i) => {
            const isAnswer = option === card.back
            const state = !answered ? 'hover:[--frame:var(--color-accent-soft)]' : isAnswer ? '[--frame:var(--color-success)] bg-success-tint' : i === picked ? '[--frame:var(--color-danger)] bg-danger-tint' : 'opacity-60'
            return (
              <li key={option}>
                <button
                  type="button"
                  disabled={answered}
                  autoFocus={i === 0}
                  onClick={() => setPicked(i)}
                  className={`px-box px-flat flex w-full items-center gap-1 px-1.5 py-1 text-left ${state}`}
                >
                  <kbd className="text-sm font-semibold text-ink-muted tabular-nums">{i + 1}</kbd>
                  <span>{option}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {answered && (
          <p role="status" className={`text-center font-semibold ${correct ? 'text-success' : 'text-danger'}`}>
            {correct ? t.review.correct : t.review.expected(card.back)}
          </p>
        )}
      </div>
      {answered && <RatingButtons onRate={onRate} suggested={correct ? 'good' : 'again'} />}
    </div>
  )
}
