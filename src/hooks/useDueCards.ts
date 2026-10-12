import { useMemo } from 'react'
import { buildReviewQueue, dueDatesByCard } from '../domain/review-queue'
import type { Card } from '../domain/types'
import { useCardsStore, useDeadlinesStore, useReviewsStore } from '../stores'
import { useCourseMap } from './useLookups'
import { useNow } from './useNow'

export type ReviewScope = { courseId?: string; subjectId?: string; deadlineId?: string }

/** Fiches dues maintenant, filtrées par cours, par matière ou par échéance. */
export function useDueCards(scope: ReviewScope = {}): Card[] {
  const cards = useCardsStore((s) => s.cards)
  const reviews = useReviewsStore((s) => s.reviews)
  const deadlines = useDeadlinesStore((s) => s.deadlines)
  const courses = useCourseMap()
  const now = useNow()
  const { courseId, subjectId, deadlineId } = scope
  return useMemo(() => {
    const deadlineCourses = deadlineId ? new Set(deadlines.find((d) => d.id === deadlineId)?.courseIds ?? []) : null
    const scoped = cards.filter((card) => {
      if (deadlineCourses) return deadlineCourses.has(card.courseId)
      if (courseId) return card.courseId === courseId
      if (subjectId) return courses.get(card.courseId)?.subjectId === subjectId
      return true
    })
    return buildReviewQueue(scoped, reviews, now, deadlines)
  }, [cards, reviews, deadlines, courses, courseId, subjectId, deadlineId, now])
}

/** Prochaine date de révision de chaque fiche, échéances comprises. */
export function useDueDates(): Map<string, number> {
  const cards = useCardsStore((s) => s.cards)
  const reviews = useReviewsStore((s) => s.reviews)
  const deadlines = useDeadlinesStore((s) => s.deadlines)
  const now = useNow()
  return useMemo(() => dueDatesByCard(cards, reviews, deadlines, now), [cards, reviews, deadlines, now])
}
