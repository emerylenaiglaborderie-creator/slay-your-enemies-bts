import { create } from 'zustand'
import { nextDeadlineForCourse } from '../domain/review-queue'
import { computeNextReview } from '../domain/spaced-repetition'
import type { Card, Review, ReviewResult } from '../domain/types'
import { getStorage } from '../storage'
import { useDeadlinesStore } from './deadlines'

type ReviewsState = {
  reviews: Review[]
  load(): Promise<void>
  /** Enregistre une réponse et programme la prochaine révision. */
  recordReview(card: Card, result: ReviewResult, now?: number): Promise<{ review: Review; previous: Review | null }>
}

export const useReviewsStore = create<ReviewsState>()((set, get) => ({
  reviews: [],
  async load() {
    set({ reviews: await getStorage().reviews.list() })
  },
  async recordReview(card, result, now = Date.now()) {
    const { reviews } = get()
    const { deadlines } = useDeadlinesStore.getState()
    let previous: Review | null = null
    for (const r of reviews) {
      if (r.cardId === card.id && (!previous || r.date > previous.date)) previous = r
    }
    const deadline = nextDeadlineForCourse(card.courseId, deadlines, now)
    const review = computeNextReview(previous, result, {
      id: crypto.randomUUID(),
      cardId: card.id,
      now,
      deadline: deadline?.date,
    })
    await getStorage().reviews.put(review)
    set((s) => ({ reviews: [...s.reviews, review] }))
    return { review, previous }
  },
}))
