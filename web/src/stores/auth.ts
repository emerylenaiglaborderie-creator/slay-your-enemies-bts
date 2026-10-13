import { create } from 'zustand'
import { api, ApiError, setToken, type AuthResponse, type Role, type User } from '../api/client'

const TOKEN_KEY = 'quiz-token'

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(value: string | null) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Stockage indisponible (navigation privée) : la session ne survivra pas au rechargement.
  }
}

type AuthState = {
  user: User | null
  /** Vrai tant que la session enregistrée n'a pas été vérifiée auprès de l'API. */
  restoring: boolean
  restore(): Promise<void>
  login(email: string, password: string): Promise<void>
  register(input: { email: string; password: string; display_name: string; role: Role }): Promise<void>
  /** Mode démo : connexion directe à un compte d'exemple (si l'API a DEMO_MODE=true). */
  demo(role: Role): Promise<void>
  logout(): void
}

export const useAuthStore = create<AuthState>()((set) => {
  const open = ({ token, user }: AuthResponse) => {
    setToken(token)
    writeToken(token)
    set({ user })
  }
  return {
    user: null,
    restoring: true,
    async restore() {
      const saved = readToken()
      if (saved) {
        setToken(saved)
        try {
          set({ user: await api<User>('GET', '/me') })
        } catch {
          setToken(null)
          writeToken(null)
        }
      }
      set({ restoring: false })
    },
    async login(email, password) {
      open(await api<AuthResponse>('POST', '/auth/login', { email, password }))
    },
    async register(input) {
      open(await api<AuthResponse>('POST', '/auth/register', input))
    },
    async demo(role) {
      try {
        open(await api<AuthResponse>('POST', '/auth/demo', { role }))
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          throw new ApiError(404, 'Mode démo désactivé : ajoute DEMO_MODE=true dans backend/.env et relance l’API.')
        }
        throw err
      }
    },
    logout() {
      setToken(null)
      writeToken(null)
      set({ user: null })
    },
  }
})
