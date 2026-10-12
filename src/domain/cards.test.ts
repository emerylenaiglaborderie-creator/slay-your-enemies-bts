import { describe, expect, it } from 'vitest'
import { cardFieldsFromDraft, emptyDraft, shuffleWithSeed, validateCardDraft } from './cards'

describe('validation des fiches', () => {
  it('exige recto et verso pour une flashcard', () => {
    expect(validateCardDraft(emptyDraft('c'))).toEqual(['frontRequired', 'backRequired'])
  })

  it('exige au moins un trou non vide pour un texte à trous', () => {
    const draft = { ...emptyDraft('c', 'cloze'), front: 'Pas de trou' }
    expect(validateCardDraft(draft)).toEqual(['clozeNoGap'])
    expect(validateCardDraft({ ...draft, front: 'Un {{ }} vide' })).toEqual(['clozeEmptyGap'])
    expect(validateCardDraft({ ...draft, front: 'Un {{trou}}' })).toEqual([])
  })

  it('exige une mauvaise réponse distincte pour un quiz', () => {
    const draft = { ...emptyDraft('c', 'quiz'), front: 'Q ?', back: 'Oui' }
    expect(validateCardDraft(draft)).toEqual(['quizNoChoice'])
    expect(validateCardDraft({ ...draft, choices: ['oui'] })).toEqual(['quizDuplicateChoice'])
    expect(validateCardDraft({ ...draft, choices: ['Non', ''] })).toEqual([])
  })

  it('calcule le verso d’un texte à trous et nettoie les choix', () => {
    expect(cardFieldsFromDraft({ ...emptyDraft('c', 'cloze'), front: ' Un {{trou}} ' }).back).toBe('trou')
    expect(cardFieldsFromDraft({ ...emptyDraft('c', 'quiz'), front: 'Q', back: 'A', choices: [' B ', ''] }).choices).toEqual(['B'])
  })

  it('mélange de façon déterministe', () => {
    const items = [1, 2, 3, 4, 5, 6]
    expect(shuffleWithSeed(items, 'x')).toEqual(shuffleWithSeed(items, 'x'))
    expect([...shuffleWithSeed(items, 'x')].sort()).toEqual(items)
  })
})
