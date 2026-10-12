import { useState, type FormEvent } from 'react'
import { isGapAnswerCorrect, parseCloze } from '../../domain/cloze'
import type { Card, ReviewResult } from '../../domain/types'
import { t } from '../../i18n'
import { Button } from '../Button'
import { RatingButtons } from './RatingButtons'

export function ClozeReview({ card, onRate }: { card: Card; onRate(result: ReviewResult): Promise<void> }) {
  const segments = parseCloze(card.front)
  const gapCount = segments.filter((s) => s.kind === 'gap').length
  const [inputs, setInputs] = useState<string[]>(() => Array.from({ length: gapCount }, () => ''))
  const [checked, setChecked] = useState(false)

  const results = segments.flatMap((s) => (s.kind === 'gap' ? [isGapAnswerCorrect(s.answers, inputs[s.index] ?? '')] : []))
  const allCorrect = results.every(Boolean)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setChecked(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="px-box px-box-lg flex flex-col gap-2 p-3">
        <p className="text-xl leading-loose">
          {segments.map((segment, i) => {
            if (segment.kind === 'text') return <span key={i} className="whitespace-pre-wrap">{segment.value}</span>
            const ok = results[segment.index]
            const width = Math.max(4, ...segment.answers.map((a) => a.length)) + 2
            return (
              <span key={i} className="inline-flex flex-col align-baseline">
                <input
                  aria-label={t.review.gapLabel(segment.index + 1)}
                  autoFocus={segment.index === 0}
                  readOnly={checked}
                  autoComplete="off"
                  spellCheck={false}
                  value={inputs[segment.index]}
                  onChange={(e) => setInputs((all) => all.map((v, j) => (j === segment.index ? e.target.value : v)))}
                  style={{ width: `${width}ch` }}
                  className={`mx-0.5 border-b-4 bg-surface-2 px-0.5 text-center font-semibold ${
                    !checked ? 'border-accent-soft' : ok ? 'border-success bg-success-tint' : 'border-danger bg-danger-tint'
                  }`}
                />
                {checked && !ok && (
                  <span className="text-center text-sm font-semibold text-success">{segment.answers[0]}</span>
                )}
              </span>
            )
          })}
        </p>
        {!checked && (
          <Button type="submit" variant="primary" className="self-center">
            {t.review.check}
          </Button>
        )}
        {checked && (
          <p role="status" className={`text-center font-semibold ${allCorrect ? 'text-success' : 'text-danger'}`}>
            {allCorrect ? t.review.correct : t.review.incorrect}
          </p>
        )}
      </form>
      {checked && <RatingButtons onRate={onRate} suggested={allCorrect ? 'good' : 'again'} />}
    </div>
  )
}
