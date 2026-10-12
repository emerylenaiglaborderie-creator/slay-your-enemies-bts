import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CardForm } from './CardForm'

describe('CardForm', () => {
  it('bloque un texte à trous sans trou puis l’enregistre une fois corrigé', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CardForm courseId="c1" onSubmit={onSubmit} />)

    await user.click(screen.getByText('Texte à trous'))
    const text = screen.getByLabelText('Texte avec trous')
    await user.type(text, 'Sans trou')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ajoute au moins un trou')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(text)
    await user.type(text, 'Un {{{{trou}}')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'cloze', front: 'Un {{trou}}', courseId: 'c1' }))
  })
})
