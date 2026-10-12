import { describe, expect, it } from 'vitest'
import { addDays, diffDays, startOfDay } from './dates'
import {
  DEFAULT_EASE,
  MIN_EASE,
  capIntervalForDeadline,
  computeNextReview,
} from './spaced-repetition'
import type { Review, ReviewResult } from './types'

const NOW = new Date(2026, 9, 12, 15, 30).getTime()
const ctx = { id: 'r', cardId: 'c', now: NOW }

function chain(results: ReviewResult[], deadline?: number): Review[] {
  const out: Review[] = []
  let prev: Review | null = null
  let now = NOW
  for (const result of results) {
    prev = computeNextReview(prev, result, { ...ctx, now, deadline })
    out.push(prev)
    now = prev.nextDue
  }
  return out
}

describe('computeNextReview', () => {
  it('démarre à 1 jour pour une nouvelle fiche', () => {
    const r = computeNextReview(null, 'good', ctx)
    expect(r.interval).toBe(1)
    expect(r.ease).toBe(DEFAULT_EASE)
    expect(r.nextDue).toBe(addDays(startOfDay(NOW), 1))
    expect(r).toMatchObject({ id: 'r', cardId: 'c', date: NOW, result: 'good' })
  })

  it('multiplie l’intervalle par ease après une bonne réponse', () => {
    const r = computeNextReview({ interval: 4, ease: 2.5 }, 'good', ctx)
    expect(r.interval).toBe(10)
  })

  it('remet l’intervalle à 1 jour et baisse ease après again', () => {
    const r = computeNextReview({ interval: 20, ease: 2.5 }, 'again', ctx)
    expect(r.interval).toBe(1)
    expect(r.ease).toBe(2.3)
  })

  it('progresse moins vite avec hard et plus vite avec easy', () => {
    const prev = { interval: 10, ease: 2.5 }
    const hard = computeNextReview(prev, 'hard', ctx)
    const good = computeNextReview(prev, 'good', ctx)
    const easy = computeNextReview(prev, 'easy', ctx)
    expect(hard.interval).toBeLessThan(good.interval)
    expect(good.interval).toBeLessThan(easy.interval)
    expect(easy.ease).toBeGreaterThan(prev.ease)
  })

  it('ne descend jamais sous l’ease minimal', () => {
    const r = computeNextReview({ interval: 1, ease: MIN_EASE }, 'again', ctx)
    expect(r.ease).toBe(MIN_EASE)
  })

  it('fait toujours avancer une fiche réussie, même avec un ease faible', () => {
    const r = computeNextReview({ interval: 1, ease: MIN_EASE }, 'good', ctx)
    expect(r.interval).toBeGreaterThan(1)
  })

  it('produit des intervalles croissants sur une suite de bonnes réponses', () => {
    const intervals = chain(['good', 'good', 'good', 'good']).map((r) => r.interval)
    expect(intervals).toEqual([1, 3, 8, 20])
  })
})

describe('plafond d’échéance', () => {
  it('ne dépasse jamais la veille de l’échéance', () => {
    const deadline = addDays(startOfDay(NOW), 5)
    const r = computeNextReview({ interval: 30, ease: 2.5 }, 'easy', { ...ctx, deadline })
    expect(r.nextDue).toBeLessThanOrEqual(addDays(deadline, -1))
  })

  it('répartit au moins 3 révisions avant l’échéance quand c’est possible', () => {
    const deadline = addDays(startOfDay(NOW), 10)
    const reviews = chain(['good', 'easy', 'easy', 'easy', 'easy'], deadline)
    const before = reviews.filter((r) => r.nextDue < deadline)
    expect(before.length).toBeGreaterThanOrEqual(3)
    for (const r of reviews) expect(r.nextDue).toBeLessThanOrEqual(addDays(deadline, -1))
  })

  it('resserre les intervalles à mesure que l’échéance approche', () => {
    expect(capIntervalForDeadline(30, NOW, addDays(NOW, 31))).toBe(10)
    expect(capIntervalForDeadline(30, NOW, addDays(NOW, 10))).toBe(3)
    expect(capIntervalForDeadline(30, NOW, addDays(NOW, 4))).toBe(1)
    expect(capIntervalForDeadline(30, NOW, addDays(NOW, 2))).toBe(1)
  })

  it('programme une dernière révision le jour même si l’échéance est demain', () => {
    const r = computeNextReview(null, 'good', { ...ctx, deadline: addDays(NOW, 1) })
    expect(r.interval).toBe(0)
    expect(r.nextDue).toBe(startOfDay(NOW))
  })

  it('ignore une échéance passée', () => {
    const r = computeNextReview({ interval: 4, ease: 2.5 }, 'good', { ...ctx, deadline: addDays(NOW, -3) })
    expect(r.interval).toBe(10)
  })

  it('ne rallonge jamais un intervalle déjà court', () => {
    expect(capIntervalForDeadline(1, NOW, addDays(NOW, 60))).toBe(1)
  })

  it('reprend à 1 jour après une révision de veille', () => {
    const r = computeNextReview({ interval: 0, ease: 2.5 }, 'good', ctx)
    expect(diffDays(NOW, r.nextDue)).toBeGreaterThanOrEqual(1)
  })
})
