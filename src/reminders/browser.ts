import { getStorage } from '../storage'
import { REMINDER_TAG, buildReminder, checkAndNotify, type ShowNotification } from './check'

/** Périodic Background Sync : absent des types DOM standards. */
type PeriodicSyncManager = {
  register(tag: string, options: { minInterval: number }): Promise<void>
  unregister(tag: string): Promise<void>
}
type RegistrationWithPeriodicSync = ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }

const BACKGROUND_INTERVAL_MS = 60 * 60 * 1000

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

async function registration(): Promise<RegistrationWithPeriodicSync | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? (reg as RegistrationWithPeriodicSync) : null
}

/** Passe par le service worker quand il existe (obligatoire sur mobile), sinon par l'API directe. */
export const showNotification: ShowNotification = async (title, options) => {
  const reg = await registration()
  if (reg) await reg.showNotification(title, options)
  else new Notification(title, options)
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/** Vrai si le navigateur pourra réveiller l'app fermée (Chrome ou Edge, app installée). */
export async function backgroundRemindersAvailable(): Promise<boolean> {
  const reg = await registration()
  if (!reg?.periodicSync || !('permissions' in navigator)) return false
  try {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
    return status.state === 'granted'
  } catch {
    return false
  }
}

export async function setBackgroundReminders(enabled: boolean): Promise<void> {
  const reg = await registration()
  if (!reg?.periodicSync) return
  try {
    if (enabled && (await backgroundRemindersAvailable())) await reg.periodicSync.register(REMINDER_TAG, { minInterval: BACKGROUND_INTERVAL_MS })
    else await reg.periodicSync.unregister(REMINDER_TAG)
  } catch {
    // Refusé par le navigateur : le rappel reste possible app ouverte.
  }
}

/** Vérifie s'il faut envoyer le rappel du jour (app ouverte). */
export async function checkReminderNow(): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  await checkAndNotify(getStorage(), showNotification)
}

/** Envoie tout de suite un exemple de rappel, sans toucher au suivi quotidien. */
export async function sendTestReminder(): Promise<number> {
  const reminder = await buildReminder(getStorage(), Date.now())
  await showNotification(reminder.title, reminder.options)
  return reminder.dueCount
}
