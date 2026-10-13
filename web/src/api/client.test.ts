import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, setToken } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
  setToken(null)
})

describe('client API', () => {
  it('envoie le jeton et le corps JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setToken('abc')
    await expect(api('POST', '/quizzes', { title: 'x' })).resolves.toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc', 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"title":"x"}')
  })

  it('remonte le message d’erreur de l’API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'accès refusé' }), { status: 403 })))
    await expect(api('GET', '/classes/1/dashboard')).rejects.toMatchObject({ status: 403, message: 'accès refusé' })
  })

  it('signale une API injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await api('GET', '/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
  })

  it('accepte un 201 sans contenu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 201 })))
    await expect(api('POST', '/quizzes/1/questions', {})).resolves.toBeUndefined()
  })

  it('renvoie undefined sur 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(api('DELETE', '/grades/1')).resolves.toBeUndefined()
  })
})
