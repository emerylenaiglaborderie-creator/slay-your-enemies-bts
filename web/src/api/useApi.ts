import { useCallback, useEffect, useState } from 'react'
import { api } from './client'

/** Charge `GET path` (rien si `path` est null) ; `reload` relance la requête. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (path === null) return
    let cancelled = false
    api<T>('GET', path)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(undefined)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [path, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload }
}

/** Message d'une erreur attrapée, pour l'afficher. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
