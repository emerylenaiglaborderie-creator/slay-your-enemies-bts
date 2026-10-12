import { addDays, diffDays, startOfDay } from './dates'
import type { Review, ReviewResult } from './types'

export const DEFAULT_EASE = 2.5
export const MIN_EASE = 1.3
export const MAX_EASE = 3.0
/** Nombre minimal de révisions à caser avant une échéance quand c'est possible. */
export const MIN_REVIEWS_BEFORE_DEADLINE = 3

const EASE_DELTA: Record<ReviewResult, number> = {
  again: -0.2,
  hard: -0.15,
  good: 0,
  easy: 0.15,
}

export type ReviewContext = {
  id: string
  cardId: string
  now: number
  /** Date de la prochaine échéance liée à la fiche, si elle existe. */
  deadline?: number
}

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100))
}

function baseInterval(previous: Pick<Review, 'interval' | 'ease'> | null, result: ReviewResult, ease: number): number {
  if (result === 'again') return 1
  if (!previous) return result === 'easy' ? 2 : 1
  // Un intervalle de 0 (révision de veille d'échéance) repart de 1 jour.
  const prev = Math.max(1, previous.interval)
  switch (result) {
    case 'hard':
      return Math.max(1, Math.round(prev * 1.2))
    case 'good':
      return Math.max(prev + 1, Math.round(prev * ease))
    case 'easy':
      return Math.max(prev + 1, Math.round(prev * ease * 1.3))
  }
}

/**
 * Plafonne l'intervalle pour qu'il reste au moins MIN_REVIEWS_BEFORE_DEADLINE
 * créneaux avant l'échéance, et que la prochaine révision tombe au plus tard
 * la veille. Renvoie l'intervalle inchangé si l'échéance est passée.
 */
export function capIntervalForDeadline(interval: number, now: number, deadline: number): number {
  const daysToDeadline = diffDays(now, deadline)
  if (daysToDeadline <= 0) return interval
  // Dernier jour possible : la veille de l'échéance.
  const daysAvailable = daysToDeadline - 1
  if (daysAvailable <= 0) return 0
  const spread = Math.max(1, Math.floor(daysAvailable / MIN_REVIEWS_BEFORE_DEADLINE))
  return Math.min(interval, spread, daysAvailable)
}

/**
 * SM-2 simplifié. Intervalle de départ 1 jour, multiplié par `ease` après une
 * bonne réponse, remis à 1 jour après `again`. Fonction pure.
 */
export function computeNextReview(
  previous: Pick<Review, 'interval' | 'ease'> | null,
  result: ReviewResult,
  ctx: ReviewContext,
): Review {
  const ease = clampEase((previous?.ease ?? DEFAULT_EASE) + EASE_DELTA[result])
  let interval = baseInterval(previous, result, ease)
  if (ctx.deadline !== undefined) {
    interval = capIntervalForDeadline(interval, ctx.now, ctx.deadline)
  }
  return {
    id: ctx.id,
    cardId: ctx.cardId,
    date: ctx.now,
    result,
    interval,
    ease,
    nextDue: addDays(startOfDay(ctx.now), interval),
  }
}

/**
 * Date de révision réellement appliquée : une échéance créée après la
 * révision peut avancer la date prévue, comme si elle avait existé avant.
 */
export function effectiveNextDue(review: Pick<Review, 'date' | 'interval' | 'nextDue'>, deadline?: number): number {
  if (deadline === undefined) return review.nextDue
  const capped = capIntervalForDeadline(review.interval, review.date, deadline)
  return Math.min(review.nextDue, addDays(startOfDay(review.date), capped))
}
