import { create } from 'zustand'
import { cardFieldsFromDraft, type CardDraft } from '../domain/cards'
import type { Card } from '../domain/types'
import { getStorage } from '../storage'
import { useReviewsStore } from './reviews'

type CardsState = {
  cards: Card[]
  load(): Promise<void>
  addCard(draft: CardDraft): Promise<Card>
  updateCard(id: string, draft: CardDraft): Promise<void>
  removeCard(id: string): Promise<void>
}

export const useCardsStore = create<CardsState>()((set, get) => ({
  cards: [],
  async load() {
    const cards = await getStorage().cards.list()
    set({ cards: cards.sort((a, b) => a.createdAt - b.createdAt) })
  },
  async addCard(draft) {
    const card: Card = { ...cardFieldsFromDraft(draft), id: crypto.randomUUID(), createdAt: Date.now() }
    await getStorage().cards.put(card)
    set((s) => ({ cards: [...s.cards, card] }))
    return card
  },
  async updateCard(id, draft) {
    const existing = get().cards.find((c) => c.id === id)
    if (!existing) return
    const card: Card = { id, createdAt: existing.createdAt, ...cardFieldsFromDraft(draft) }
    await getStorage().cards.put(card)
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? card : c)) }))
  },
  async removeCard(id) {
    await getStorage().removeCard(id)
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }))
    useReviewsStore.setState((s) => ({ reviews: s.reviews.filter((r) => r.cardId !== id) }))
  },
}))
