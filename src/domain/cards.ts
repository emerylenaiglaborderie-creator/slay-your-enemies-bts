import { clozeAnswerSummary, clozeGaps } from './cloze'
import type { Card, CardType } from './types'

export type CardDraft = {
  courseId: string
  type: CardType
  front: string
  back: string
  choices: string[]
}

export type CardDraftError =
  | 'frontRequired'
  | 'backRequired'
  | 'clozeNoGap'
  | 'clozeEmptyGap'
  | 'quizNoChoice'
  | 'quizDuplicateChoice'

export function emptyDraft(courseId: string, type: CardType = 'flashcard'): CardDraft {
  return { courseId, type, front: '', back: '', choices: [''] }
}

export function draftFromCard(card: Card): CardDraft {
  return {
    courseId: card.courseId,
    type: card.type,
    front: card.front,
    back: card.back,
    choices: card.choices && card.choices.length > 0 ? [...card.choices] : [''],
  }
}

export function validateCardDraft(draft: CardDraft): CardDraftError[] {
  const errors: CardDraftError[] = []
  if (!draft.front.trim()) errors.push('frontRequired')
  if (draft.type === 'cloze') {
    const gaps = clozeGaps(draft.front)
    if (draft.front.trim() && gaps.length === 0) errors.push('clozeNoGap')
    if (gaps.some((g) => g.answers.length === 0)) errors.push('clozeEmptyGap')
    return errors
  }
  if (!draft.back.trim()) errors.push('backRequired')
  if (draft.type === 'quiz') {
    const choices = draft.choices.map((c) => c.trim()).filter(Boolean)
    if (choices.length === 0) errors.push('quizNoChoice')
    const all = [draft.back.trim().toLowerCase(), ...choices.map((c) => c.toLowerCase())]
    if (new Set(all).size !== all.length) errors.push('quizDuplicateChoice')
  }
  return errors
}

/** Normalise un brouillon valide en champs de fiche. */
export function cardFieldsFromDraft(draft: CardDraft): Pick<Card, 'courseId' | 'type' | 'front' | 'back' | 'choices'> {
  const front = draft.front.trim()
  switch (draft.type) {
    case 'cloze':
      return { courseId: draft.courseId, type: 'cloze', front, back: clozeAnswerSummary(front) }
    case 'quiz':
      return {
        courseId: draft.courseId,
        type: 'quiz',
        front,
        back: draft.back.trim(),
        choices: draft.choices.map((c) => c.trim()).filter(Boolean),
      }
    case 'flashcard':
      return { courseId: draft.courseId, type: 'flashcard', front, back: draft.back.trim() }
  }
}

/** Mélange déterministe (même graine, même ordre) pour les choix de quiz. */
export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
