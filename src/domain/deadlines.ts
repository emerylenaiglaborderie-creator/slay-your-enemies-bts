import { diffDays, fromDateInput, startOfDay } from './dates'
import type { Deadline, DeadlineType } from './types'

export const DEADLINE_TYPES: DeadlineType[] = ['controle', 'examen', 'projet']

export type DeadlineDraft = {
  subjectId: string
  type: DeadlineType
  /** Valeur AAAA-MM-JJ du champ date. */
  date: string
  courseIds: string[]
}

export type DeadlineDraftError = 'subjectRequired' | 'dateRequired' | 'dateInPast'

export function validateDeadlineDraft(draft: DeadlineDraft, now: number): DeadlineDraftError[] {
  const errors: DeadlineDraftError[] = []
  if (!draft.subjectId) errors.push('subjectRequired')
  const date = fromDateInput(draft.date)
  if (date === null) errors.push('dateRequired')
  else if (date < startOfDay(now)) errors.push('dateInPast')
  return errors
}

/** Champs d'une échéance à partir d'un brouillon valide. */
export function deadlineFieldsFromDraft(draft: DeadlineDraft): Omit<Deadline, 'id'> {
  const date = fromDateInput(draft.date)
  if (date === null) throw new Error('Date d’échéance invalide')
  return { subjectId: draft.subjectId, type: draft.type, date, courseIds: [...new Set(draft.courseIds)] }
}

/** Jours calendaires restants avant l'échéance (0 le jour même, négatif si passée). */
export function daysUntil(deadline: Pick<Deadline, 'date'>, now: number): number {
  return diffDays(now, deadline.date)
}

/** Échéances à venir (y compris aujourd'hui), la plus proche en premier. */
export function upcomingDeadlines(deadlines: readonly Deadline[], now: number): Deadline[] {
  const today = startOfDay(now)
  return deadlines.filter((d) => d.date >= today).sort((a, b) => a.date - b.date)
}

/** Échéances passées, la plus récente en premier. */
export function pastDeadlines(deadlines: readonly Deadline[], now: number): Deadline[] {
  const today = startOfDay(now)
  return deadlines.filter((d) => d.date < today).sort((a, b) => b.date - a.date)
}
