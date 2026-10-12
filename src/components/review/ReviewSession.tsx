import { useState } from 'react'
import type { Card, ReviewResult } from '../../domain/types'
import type { SessionAnswer, SessionReward } from '../../domain/xp'
import { useCourseMap, useSubjectMap } from '../../hooks/useLookups'
import { useRecoveryPlans } from '../../hooks/useRecoveryPlans'
import { t } from '../../i18n'
import { usePetStore, useReviewsStore } from '../../stores'
import { Button } from '../Button'
import { SubjectBadge } from '../SubjectBadge'
import { ClozeReview } from './ClozeReview'
import { FlashcardReview } from './FlashcardReview'
import { QuizReview } from './QuizReview'
import { SessionSummary } from './SessionSummary'

type Props = { cards: readonly Card[]; onExit(): void }

export function ReviewSession({ cards, onExit }: Props) {
  const recordReview = useReviewsStore((s) => s.recordReview)
  const courses = useCourseMap()
  const subjects = useSubjectMap()
  const [index, setIndex] = useState(0)
  const rewardSession = usePetStore((s) => s.rewardSession)
  const recoverySubjectIds = useRecoveryPlans().map((p) => p.subjectId)
  const [answers, setAnswers] = useState<SessionAnswer[]>([])
  const [reward, setReward] = useState<SessionReward | null>(null)
  const [seed] = useState(() => String(Date.now()))

  if (index >= cards.length) {
    return <SessionSummary results={answers.map((a) => a.result)} reward={reward} onExit={onExit} />
  }

  const card = cards[index]
  const course = courses.get(card.courseId)

  async function rate(result: ReviewResult) {
    const { previous } = await recordReview(card, result)
    const next = [...answers, { previous: previous?.result, result, subjectId: course?.subjectId }]
    setAnswers(next)
    // L'XP est attribuée une seule fois, à la fin de la session.
    if (index + 1 >= cards.length) setReward(await rewardSession(next, recoverySubjectIds))
    setIndex((i) => i + 1)
  }

  async function quit() {
    // Une session interrompue rapporte quand même l'XP des fiches faites.
    if (answers.length > 0) await rewardSession(answers, recoverySubjectIds)
    onExit()
  }

  const props = { card, onRate: rate }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <SubjectBadge subject={course && subjects.get(course.subjectId)} />
          <span className="truncate text-ink-muted">{course?.title}</span>
        </div>
        <Button variant="ghost" onClick={() => void quit()}>
          {t.review.quit}
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <div
          role="progressbar"
          aria-label={t.review.progress(index + 1, cards.length)}
          aria-valuemin={0}
          aria-valuemax={cards.length}
          aria-valuenow={index}
          className="px-box px-flat h-1.5 flex-1 overflow-hidden bg-surface-2"
        >
          <div className="h-full bg-accent-tint transition-[width]" style={{ width: `${(index / cards.length) * 100}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {index + 1}/{cards.length}
        </span>
      </div>
      {card.type === 'flashcard' && <FlashcardReview key={card.id} {...props} />}
      {card.type === 'cloze' && <ClozeReview key={card.id} {...props} />}
      {card.type === 'quiz' && <QuizReview key={card.id} seed={seed} {...props} />}
      <p className="text-center text-sm text-ink-muted">{t.review.keyboardHint}</p>
    </div>
  )
}
