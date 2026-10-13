import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Role } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { Layout } from './Layout'

function renderAs(role: Role) {
  useAuthStore.setState({ user: { id: '1', email: 'a@b.fr', display_name: 'Test', role, created_at: '' } })
  render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  )
}

afterEach(() => useAuthStore.setState({ user: null }))

describe('navigation selon le rôle', () => {
  it('élève : dragon, pas de suivi', () => {
    renderAs('student')
    expect(screen.getByRole('link', { name: /Dragon/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Suivi/ })).not.toBeInTheDocument()
    expect(screen.getByText('Élève')).toBeInTheDocument()
  })

  it('formateur : suivi des élèves, pas de dragon', () => {
    renderAs('trainer')
    expect(screen.getByRole('link', { name: /Suivi/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Dragon/ })).not.toBeInTheDocument()
  })
})
