import { effectiveNextDue } from './spaced-repetition'
import type { Card, Deadline, Review } from './types'

/** Dernière révision connue pour chaque fiche. */
export function latestReviewByCard(reviews: readonly Review[]): Map<string, Review> {
  const latest = new Map<string, Review>()
  for (const review of reviews) {
    const current = latest.get(review.cardId)
    if (!current || review.date > current.date) latest.set(review.cardId, review)
  }
  return latest
}

/** Prochaine échéance (non passée) qui couvre le cours de la fiche. */
export function nextDeadlineForCourse(
  courseId: string,
  deadlines: readonly Deadline[],
  now: number,
): Deadline | undefined {
  return deadlines
    .filter((d) => d.date > now && d.courseIds.includes(courseId))
    .sort((a, b) => a.date - b.date)[0]
}

/**
 * Prochaine date de révision de chaque fiche déjà révisée, plafonnée par
 * l'échéance à venir de son cours. Les fiches jamais révisées sont absentes.
 */
export function dueDatesByCard(
  cards: readonly Card[],
  reviews: readonly Review[],
  deadlines: readonly Deadline[],
  now: number,
): Map<string, number> {
  const latest = latestReviewByCard(reviews)
  const dueDates = new Map<string, number>()
  for (const card of cards) {
    const last = latest.get(card.id)
    if (!last) continue
    const deadline = nextDeadlineForCourse(card.courseId, deadlines, now)
    dueDates.set(card.id, effectiveNextDue(last, deadline?.date))
  }
  return dueDates
}

/**
 * Fiches à réviser maintenant : d'abord celles en retard (les plus anciennes
 * en premier), puis les nouvelles dans l'ordre de création.
 */
export function buildReviewQueue(
  cards: readonly Card[],
  reviews: readonly Review[],
  now: number,
  deadlines: readonly Deadline[] = [],
): Card[] {
  const dueDates = dueDatesByCard(cards, reviews, deadlines, now)
  const due: { card: Card; nextDue: number }[] = []
  const fresh: Card[] = []
  for (const card of cards) {
    const nextDue = dueDates.get(card.id)
    if (nextDue === undefined) fresh.push(card)
    else if (nextDue <= now) due.push({ card, nextDue })
  }
  due.sort((a, b) => a.nextDue - b.nextDue)
  fresh.sort((a, b) => a.createdAt - b.createdAt)
  return [...due.map((d) => d.card), ...fresh]
}
