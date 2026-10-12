import { describe, expect, it } from 'vitest'
import { clozeAnswerSummary, isGapAnswerCorrect, parseCloze } from './cloze'

describe('textes à trous', () => {
  it('découpe le texte et les trous', () => {
    expect(parseCloze('La {{Révolution}} commence en {{1789}}.')).toEqual([
      { kind: 'text', value: 'La ' },
      { kind: 'gap', index: 0, answers: ['Révolution'] },
      { kind: 'text', value: ' commence en ' },
      { kind: 'gap', index: 1, answers: ['1789'] },
      { kind: 'text', value: '.' },
    ])
  })

  it('accepte des variantes séparées par |', () => {
    const [gap] = parseCloze('{{H2O|eau}}')
    expect(gap).toEqual({ kind: 'gap', index: 0, answers: ['H2O', 'eau'] })
    expect(isGapAnswerCorrect(['H2O', 'eau'], '  Eau ')).toBe(true)
  })

  it('reste sensible aux accents et refuse une réponse vide', () => {
    expect(isGapAnswerCorrect(['élève'], 'eleve')).toBe(false)
    expect(isGapAnswerCorrect(['élève'], '   ')).toBe(false)
  })

  it('résume les réponses pour le verso', () => {
    expect(clozeAnswerSummary('{{a|b}} et {{c}}')).toBe('a · c')
  })
})
