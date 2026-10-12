import { addDays, diffDays, fromDateInput, startOfDay } from './dates'
import type { Grade } from './types'

/** Réglages des notes (valeurs de départ, à ajuster). Tout est ramené sur 20. */
export const GRADE_RULES = {
  /** À partir de cette note sur 20 : bonus d'XP ponctuel. */
  goodThreshold: 14,
  /** En dessous de cette note sur 20 : plan de rattrapage. */
  badThreshold: 10,
  /** Bonus unique pour une bonne note. */
  goodGradeBonus: 20,
  /** Une note plus ancienne ne donne pas de bonus (évite la saisie rétroactive). */
  bonusMaxAgeDays: 14,
  /** Durée d'un plan de rattrapage. */
  recoveryDays: 14,
  /** Bonus par fiche réussie de la matière pendant le plan, plafonné par session. */
  recoveryBonusPerCard: 3,
  recoveryBonusMax: 15,
} as const

export type GradeLevel = 'good' | 'neutral' | 'bad'

export type GradeDraft = {
  subjectId: string
  value: string
  max: string
  coef: string
  /** AAAA-MM-JJ */
  date: string
}

export type GradeDraftError = 'subjectRequired' | 'valueInvalid' | 'maxInvalid' | 'coefInvalid' | 'dateRequired' | 'dateInFuture'

/** Accepte la virgule décimale française. */
export function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function validateGradeDraft(draft: GradeDraft, now: number): GradeDraftError[] {
  const errors: GradeDraftError[] = []
  if (!draft.subjectId) errors.push('subjectRequired')
  const max = parseNumber(draft.max)
  const value = parseNumber(draft.value)
  const coef = parseNumber(draft.coef)
  if (max === null || max <= 0) errors.push('maxInvalid')
  if (value === null || value < 0 || (max !== null && max > 0 && value > max)) errors.push('valueInvalid')
  if (coef === null || coef <= 0) errors.push('coefInvalid')
  const date = fromDateInput(draft.date)
  if (date === null) errors.push('dateRequired')
  else if (date > startOfDay(now)) errors.push('dateInFuture')
  return errors
}

export function gradeFieldsFromDraft(draft: GradeDraft): Omit<Grade, 'id'> {
  const value = parseNumber(draft.value)
  const max = parseNumber(draft.max)
  const coef = parseNumber(draft.coef)
  const date = fromDateInput(draft.date)
  if (value === null || max === null || coef === null || date === null) throw new Error('Note invalide')
  return { subjectId: draft.subjectId, value, max, coef, date }
}

export function on20(grade: Pick<Grade, 'value' | 'max'>): number {
  return (grade.value / grade.max) * 20
}

export function gradeLevel(grade: Pick<Grade, 'value' | 'max'>): GradeLevel {
  const score = on20(grade)
  if (score >= GRADE_RULES.goodThreshold) return 'good'
  if (score < GRADE_RULES.badThreshold) return 'bad'
  return 'neutral'
}

/** Moyenne pondérée sur 20, ou null sans note. */
export function weightedAverage(grades: readonly Grade[]): number | null {
  const totalCoef = grades.reduce((sum, g) => sum + g.coef, 0)
  if (totalCoef === 0) return null
  return grades.reduce((sum, g) => sum + on20(g) * g.coef, 0) / totalCoef
}

/** Une bonne note récente rapporte un bonus unique, au moment de sa saisie. */
export function earnsGoodGradeBonus(grade: Grade, now: number): boolean {
  const age = diffDays(grade.date, now)
  return gradeLevel(grade) === 'good' && age >= 0 && age <= GRADE_RULES.bonusMaxAgeDays
}

export type RecoveryPlan = { subjectId: string; gradeId: string; until: number }

/**
 * Plans de rattrapage en cours : la dernière mauvaise note d'une matière ouvre
 * un plan pendant quelques jours. Seule une note correcte datée d'un jour
 * postérieur le ferme (deux notes le même jour laissent le plan ouvert).
 */
export function activeRecoveryPlans(grades: readonly Grade[], now: number): RecoveryPlan[] {
  const today = startOfDay(now)
  const bySubject = new Map<string, Grade[]>()
  for (const g of grades) bySubject.set(g.subjectId, [...(bySubject.get(g.subjectId) ?? []), g])
  const plans: RecoveryPlan[] = []
  for (const [subjectId, list] of bySubject) {
    const lastBad = list.filter((g) => gradeLevel(g) === 'bad').sort((a, b) => b.date - a.date)[0]
    if (!lastBad) continue
    const badDay = startOfDay(lastBad.date)
    const recovered = list.some((g) => gradeLevel(g) !== 'bad' && startOfDay(g.date) > badDay)
    const until = addDays(badDay, GRADE_RULES.recoveryDays)
    if (!recovered && until > today) plans.push({ subjectId, gradeId: lastBad.id, until })
  }
  return plans.sort((a, b) => a.until - b.until)
}
