import { useCallback, useState } from 'react'
import type { Card, ReviewResult } from '../../domain/types'
import { useKeydown } from '../../hooks/useKeydown'
import { t } from '../../i18n'
import { Button } from '../Button'
import { RatingButtons } from './RatingButtons'

const face = 'flip-face flex min-h-[240px] flex-col items-center justify-center gap-1 px-box px-box-lg p-3 text-center'

export function FlashcardReview({ card, onRate }: { card: Card; onRate(result: ReviewResult): Promise<void> }) {
  const [flipped, setFlipped] = useState(false)

  useKeydown(
    useCallback((event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        setFlipped(true)
      }
    }, []),
    !flipped,
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flip">
        <div className="flip-inner" data-flipped={flipped}>
          <div className={face} aria-hidden={flipped}>
            <p className="text-xl font-semibold whitespace-pre-wrap">{card.front}</p>
          </div>
          <div className={`${face} flip-back`} aria-hidden={!flipped}>
            <p className="text-sm text-ink-muted whitespace-pre-wrap">{card.front}</p>
            <p className="text-xl font-semibold whitespace-pre-wrap" aria-live="polite">
              {flipped ? card.back : ''}
            </p>
          </div>
        </div>
      </div>
      {flipped ? (
        <RatingButtons onRate={onRate} />
      ) : (
        <Button variant="primary" autoFocus className="self-center" onClick={() => setFlipped(true)}>
          {t.review.showAnswer}
        </Button>
      )}
    </div>
  )
}
