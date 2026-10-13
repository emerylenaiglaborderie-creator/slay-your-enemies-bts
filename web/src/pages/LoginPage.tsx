import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '../api/client'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { Panel } from '../components/Panel'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

type Mode = 'login' | 'register'

export function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const demo = useAuthStore((s) => s.demo)
  const [mode, setMode] = useState<Mode>('login')
  const [role, setRole] = useState<Role>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function run(action: () => Promise<void>) {
    setError(undefined)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(() => (mode === 'login' ? login(email, password) : register({ email, password, display_name: displayName, role })))
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => {
        setMode(value)
        setError(undefined)
      }}
      className={`flex-1 px-1 py-1 font-semibold ${mode === value ? 'px-box px-flat bg-accent-tint text-ink' : 'text-ink-muted hover:text-ink'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-2 py-4">
      <h1 className="text-center font-pixel text-3xl font-semibold">{t.appName}</h1>
      <Panel className="flex flex-col gap-2">
        <div role="tablist" className="flex gap-1">
          {tab('login', t.auth.login)}
          {tab('register', t.auth.register)}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2">
          {mode === 'register' && (
            <>
              <fieldset className="flex flex-col gap-0.5">
                <legend className="text-sm font-semibold">{t.auth.roleLabel}</legend>
                <div className="flex gap-1">
                  {(['student', 'trainer'] as const).map((value) => (
                    <label
                      key={value}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-1 px-box px-flat py-1 font-semibold ${
                        role === value ? 'bg-accent-tint text-ink [--frame:var(--color-accent-soft)]' : 'bg-surface text-ink-muted'
                      }`}
                    >
                      <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
                      {t.auth.roles[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextField label={t.auth.displayName} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoComplete="name" />
            </>
          )}
          <TextField label={t.auth.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <TextField
            label={t.auth.password}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
            hint={mode === 'register' ? t.auth.passwordHint : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === 'login' ? t.auth.login : t.auth.createAccount}
          </Button>
        </form>
      </Panel>
      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.auth.demoTitle}</h2>
        <p className="text-sm text-ink-muted">{t.auth.demoText}</p>
        <div className="flex gap-1">
          {(['student', 'trainer'] as const).map((value) => (
            <Button key={value} className="flex-1" disabled={busy} onClick={() => void run(() => demo(value))}>
              {t.auth.demoAs(t.auth.roles[value])}
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  )
}
