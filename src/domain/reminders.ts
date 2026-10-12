import { addDays, diffDays, startOfDay } from './dates'
import { buildReviewQueue } from './review-queue'
import type { Card, Deadline, Review } from './types'

/** Réglages des rappels, enregistrés dans IndexedDB pour être lus par le service worker. */
export type ReminderSettings = {
  id: 'reminders'
  enabled: boolean
  /** Heure du rappel, HH:MM. */
  time: string
  /** Minuit du dernier jour où un rappel a été envoyé. */
  lastNotifiedDay: number | null
}

/** Une échéance à moins de ce nombre de jours est citée dans le rappel. */
export const REMINDER_DEADLINE_DAYS = 7

export function defaultReminderSettings(): ReminderSettings {
  return { id: 'reminders', enabled: false, time: '18:00', lastNotifiedDay: null }
}

/** Instant du rappel pour le jour de `now`, ou null si l'heure est invalide. */
export function reminderTimeToday(time: string, now: number): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const d = new Date(startOfDay(now))
  d.setHours(hours, minutes)
  return d.getTime()
}

/** Fiches à réviser d'ici la fin de la journée (échéances comprises). */
export function cardsDueToday(cards: readonly Card[], reviews: readonly Review[], deadlines: readonly Deadline[], now: number): number {
  const endOfDay = addDays(startOfDay(now), 1) - 1
  return buildReviewQueue(cards, reviews, endOfDay, deadlines).length
}

/** Un rappel par jour au plus, après l'heure choisie, et seulement s'il y a des fiches à revoir. */
export function shouldNotify(settings: ReminderSettings, dueCount: number, now: number): boolean {
  if (!settings.enabled || dueCount === 0) return false
  const at = reminderTimeToday(settings.time, now)
  if (at === null || now < at) return false
  return settings.lastNotifiedDay !== startOfDay(now)
}

export type ReminderContent = {
  dueCount: number
  /** Échéance la plus proche, si elle tombe dans les prochains jours. */
  deadline?: { deadline: Deadline; days: number }
}

export function reminderContent(dueCount: number, deadlines: readonly Deadline[], now: number): ReminderContent {
  const today = startOfDay(now)
  const next = deadlines.filter((d) => d.date >= today).sort((a, b) => a.date - b.date)[0]
  const days = next ? diffDays(now, next.date) : Infinity
  return next && days <= REMINDER_DEADLINE_DAYS ? { dueCount, deadline: { deadline: next, days } } : { dueCount }
}
