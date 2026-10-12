import { useEffect, useState } from 'react'

const REFRESH_MS = 60_000

/** Horloge partagée par la page, rafraîchie chaque minute pour les fiches qui deviennent dues. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])
  return now
}
