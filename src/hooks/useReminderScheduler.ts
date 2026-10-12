import { useEffect } from 'react'
import { checkReminderNow } from '../reminders/browser'
import { useRemindersStore } from '../stores'

const CHECK_EVERY_MS = 60_000

/** Tant que l'app est ouverte, vérifie chaque minute s'il est l'heure du rappel. */
export function useReminderScheduler(): void {
  const enabled = useRemindersStore((s) => s.settings.enabled)
  useEffect(() => {
    if (!enabled) return
    const check = () => void checkReminderNow()
    check()
    const id = window.setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [enabled])
}
