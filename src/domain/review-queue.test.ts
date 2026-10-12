import { describe, expect, it } from 'vitest'
import { addDays, startOfDay } from './dates'
import { buildReviewQueue, dueDatesByCard, latestReviewByCard, nextDeadlineForCourse } from './review-queue'
import type { Card, Deadline, Review } from './types'

const card = (id: string, createdAt = 0): Card => ({ id, courseId: 'c1', type: 'flashcard', front: id, back: id, createdAt })
const review = (cardId: string, date: number, nextDue: number): Review => ({
  id: `${cardId}-${date}`,
  cardId,
  date,
  nextDue,
  result: 'good',
  interval: 1,
  ease: 2.5,
})

describe('file de révision', () => {
  it('garde la révision la plus récente par fiche', () => {
    const latest = latestReviewByCard([review('a', 1, 10), review('a', 5, 50), review('a', 3, 30)])
    expect(latest.get('a')?.nextDue).toBe(50)
  })

  it('met les fiches en retard avant les nouvelles et exclut les autres', () => {
    const cards = [card('new2', 2), card('late'), card('later'), card('future'), card('new1', 1)]
    const reviews = [review('late', 0, 10), review('later', 0, 20), review('future', 0, 1000)]
    expect(buildReviewQueue(cards, reviews, 100).map((c) => c.id)).toEqual(['late', 'later', 'new1', 'new2'])
  })

  it('choisit la prochaine échéance non passée du cours', () => {
    const d = (id: string, date: number, courseIds: string[]): Deadline => ({ id, subjectId: 's', type: 'controle', date, courseIds })
    const deadlines = [d('past', 5, ['c1']), d('far', 300, ['c1']), d('near', 200, ['c1']), d('other', 150, ['c2'])]
    expect(nextDeadlineForCourse('c1', deadlines, 100)?.id).toBe('near')
    expect(nextDeadlineForCourse('c3', deadlines, 100)).toBeUndefined()
  })

  it('avance une révision prévue après la veille d’une échéance créée ensuite', () => {
    const day = new Date(2026, 9, 1, 10).getTime()
    const reviewedAt = { ...review('a', day, addDays(startOfDay(day), 20)), interval: 20 }
    const exam: Deadline = { id: 'e', subjectId: 's', type: 'examen', date: addDays(startOfDay(day), 10), courseIds: ['c1'] }
    const now = addDays(day, 2)

    const due = dueDatesByCard([card('a')], [reviewedAt], [exam], now).get('a')
    // 9 jours disponibles avant la veille, répartis en au moins 3 révisions.
    expect(due).toBe(addDays(startOfDay(day), 3))
    expect(buildReviewQueue([card('a')], [reviewedAt], now, [exam])).toEqual([])
    expect(buildReviewQueue([card('a')], [reviewedAt], addDays(day, 3), [exam]).map((c) => c.id)).toEqual(['a'])
  })

  it('ne change rien sans échéance ni pour une révision déjà assez proche', () => {
    const r = review('a', 0, 5)
    expect(dueDatesByCard([card('a')], [r], [], 1).get('a')).toBe(5)
  })
})
