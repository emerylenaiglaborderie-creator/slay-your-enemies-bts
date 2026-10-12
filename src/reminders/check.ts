import { startOfDay } from '../domain/dates'
import { cardsDueToday, defaultReminderSettings, reminderContent, shouldNotify } from '../domain/reminders'
import { t } from '../i18n'
import type { AppStorage } from '../storage/types'

export type ShowNotification = (title: string, options: NotificationOptions) => Promise<void>

export const REMINDER_TAG = 'revision-reminder'

/** Construit le rappel du jour à partir des données locales. */
export async function buildReminder(storage: AppStorage, now: number): Promise<{ dueCount: number; title: string; options: NotificationOptions }> {
  const [cards, reviews, deadlines, subjects] = await Promise.all([
    storage.cards.list(),
    storage.reviews.list(),
    storage.deadlines.list(),
    storage.subjects.list(),
  ])
  const dueCount = cardsDueToday(cards, reviews, deadlines, now)
  const content = reminderContent(dueCount, deadlines, now)
  const deadline = content.deadline && {
    type: content.deadline.deadline.type,
    subject: subjects.find((s) => s.id === content.deadline?.deadline.subjectId)?.name ?? '',
    days: content.deadline.days,
  }
  return {
    dueCount,
    title: t.reminders.notificationTitle,
    options: {
      body: t.reminders.notificationBody(dueCount, deadline),
      tag: REMINDER_TAG,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: '/reviser' },
    },
  }
}

/**
 * Envoie le rappel du jour s'il est temps. Partagé entre l'app ouverte et le
 * service worker ; le tag commun évite un doublon si les deux se déclenchent.
 */
export async function checkAndNotify(storage: AppStorage, show: ShowNotification, now = Date.now()): Promise<boolean> {
  const settings = (await storage.settings.get('reminders')) ?? defaultReminderSettings()
  if (!settings.enabled) return false
  const reminder = await buildReminder(storage, now)
  if (!shouldNotify(settings, reminder.dueCount, now)) return false
  await show(reminder.title, reminder.options)
  await storage.settings.put({ ...settings, lastNotifiedDay: startOfDay(now) })
  return true
}
