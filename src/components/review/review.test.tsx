import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Card } from '../../domain/types'
import { ClozeReview } from './ClozeReview'
import { FlashcardReview } from './FlashcardReview'
import { QuizReview } from './QuizReview'

const base = { courseId: 'c', createdAt: 0 }

describe('révision', () => {
  it('retourne une flashcard à l’espace puis note au clavier', async () => {
    const user = userEvent.setup()
    const onRate = vi.fn().mockResolvedValue(undefined)
    const card: Card = { ...base, id: 'f', type: 'flashcard', front: 'Capitale ?', back: 'Paris' }
    render(<FlashcardReview card={card} onRate={onRate} />)

    expect(screen.queryByText('Paris')).not.toBeInTheDocument()
    await user.keyboard(' ')
    expect(screen.getByText('Paris')).toBeInTheDocument()
    await user.keyboard('3')
    expect(onRate).toHaveBeenCalledWith('good')
  })

  it('corrige un texte à trous et propose "À revoir" en cas d’erreur', async () => {
    const user = userEvent.setup()
    const onRate = vi.fn().mockResolvedValue(undefined)
    const card: Card = { ...base, id: 'z', type: 'cloze', front: 'La {{Loire}} et la {{Seine}}', back: 'Loire · Seine' }
    render(<ClozeReview card={card} onRate={onRate} />)

    await user.keyboard('loire')
    await user.type(screen.getByLabelText('Trou 2'), 'Rhône{Enter}')

    expect(screen.getByRole('status')).toHaveTextContent('Pas tout à fait')
    expect(screen.getByText('Seine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /À revoir/ })).toHaveFocus()
  })

  it('valide un quiz et propose "Bien" pour une bonne réponse', async () => {
    const user = userEvent.setup()
    const onRate = vi.fn().mockResolvedValue(undefined)
    const card: Card = { ...base, id: 'q', type: 'quiz', front: '2 + 2 ?', back: '4', choices: ['3', '5'] }
    render(<QuizReview card={card} seed="s" onRate={onRate} />)

    await user.click(screen.getByRole('button', { name: /4/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Bonne réponse')
    expect(screen.getByRole('button', { name: /Bien/ })).toHaveFocus()
  })
})
