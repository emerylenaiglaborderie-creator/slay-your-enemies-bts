import { diffDays, startOfDay } from './dates'
import { GRADE_RULES } from './grades'
import { stageIndexForLevel } from './pet-stages'
import type { Pet, ReviewResult } from './types'

/** Réglages de progression (valeurs de départ, à ajuster). */
export const XP_RULES = {
  /** XP fixe pour toute session d'au moins une fiche. */
  sessionBase: 15,
  /** Par fiche passée de "À revoir" à "Bien" ou "Facile". */
  masteryBonus: 5,
  /** Plafond quotidien pour éviter le grind. */
  dailyCap: 60,
  /** Bonus de streak par jour consécutif au-delà du premier. */
  streakStep: 0.05,
  /** Bonus de streak maximal (x1.5). */
  streakMaxBonus: 0.5,
  /** XP pour passer du niveau 1 au niveau 2, puis augmentation par niveau. */
  levelBaseCost: 20,
  levelCostStep: 5,
} as const

/** Compagnon persistant : le Pet du brief, plus ce qu'il faut pour le streak et le plafond. */
export type PetState = Pet & {
  /** Minuit du dernier jour avec une session, null si aucune. */
  lastActiveDay: number | null
  /** XP déjà gagnée ce jour-là (pour le plafond quotidien). */
  xpOnLastActiveDay: number
}

export function createPet(name: string): PetState {
  return { id: 'dragon', species: 'dragon', name, xp: 0, level: 1, stage: 0, streak: 0, lastActiveDay: null, xpOnLastActiveDay: 0 }
}

/** XP totale nécessaire pour atteindre un niveau. */
export function xpForLevel(level: number): number {
  const steps = Math.max(0, level - 1)
  return steps * XP_RULES.levelBaseCost + (XP_RULES.levelCostStep * steps * (steps - 1)) / 2
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return level
}

/** Avancement dans le niveau courant. */
export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelForXp(xp)
  const start = xpForLevel(level)
  return { level, current: xp - start, needed: xpForLevel(level + 1) - start }
}

/** Streak affiché : il retombe à 0 si la veille n'a pas eu de session (sans autre conséquence). */
export function currentStreak(pet: Pick<PetState, 'streak' | 'lastActiveDay'>, now: number): number {
  if (pet.lastActiveDay === null) return 0
  return diffDays(pet.lastActiveDay, now) <= 1 ? pet.streak : 0
}

/** XP encore gagnable aujourd'hui. */
export function remainingXpToday(pet: Pick<PetState, 'lastActiveDay' | 'xpOnLastActiveDay'>, now: number): number {
  const earned = pet.lastActiveDay === startOfDay(now) ? pet.xpOnLastActiveDay : 0
  return Math.max(0, XP_RULES.dailyCap - earned)
}

export function streakMultiplier(streak: number): number {
  return 1 + Math.min(XP_RULES.streakMaxBonus, Math.max(0, streak - 1) * XP_RULES.streakStep)
}

/** Réponse donnée pendant la session, avec le résultat précédent de la fiche. */
export type SessionAnswer = { previous: ReviewResult | undefined; result: ReviewResult; subjectId?: string }

const isSuccess = (result: ReviewResult) => result === 'good' || result === 'easy'

export type SessionReward = {
  pet: PetState
  gained: number
  base: number
  mastered: number
  /** Bonus du plan de rattrapage (avant multiplicateur). */
  recovery: number
  multiplier: number
  capped: boolean
  levelsGained: number
  stageChanged: boolean
}

/**
 * Applique une session de révision au compagnon. L'XP ne baisse jamais,
 * le niveau non plus ; une journée manquée remet seulement le streak à 1.
 */
export function applySession(
  pet: PetState,
  answers: readonly SessionAnswer[],
  now: number,
  /** Matières en plan de rattrapage. */
  recoverySubjectIds: readonly string[] = [],
): SessionReward {
  const today = startOfDay(now)
  const noReward = { pet, gained: 0, base: 0, mastered: 0, recovery: 0, multiplier: 1, capped: false, levelsGained: 0, stageChanged: false }
  if (answers.length === 0) return noReward

  const streak =
    pet.lastActiveDay === today ? Math.max(1, pet.streak) : pet.lastActiveDay !== null && diffDays(pet.lastActiveDay, today) === 1 ? pet.streak + 1 : 1
  const mastered = answers.filter((a) => a.previous === 'again' && isSuccess(a.result)).length
  const recoveryCards = answers.filter((a) => isSuccess(a.result) && a.subjectId !== undefined && recoverySubjectIds.includes(a.subjectId)).length
  const recovery = Math.min(GRADE_RULES.recoveryBonusMax, recoveryCards * GRADE_RULES.recoveryBonusPerCard)
  const base = XP_RULES.sessionBase
  const multiplier = streakMultiplier(streak)
  const raw = Math.round((base + mastered * XP_RULES.masteryBonus + recovery) * multiplier)
  const remaining = remainingXpToday(pet, now)
  const gained = Math.min(raw, remaining)

  const xp = pet.xp + gained
  const level = Math.max(pet.level, levelForXp(xp))
  const stage = Math.max(pet.stage, stageIndexForLevel(level))
  const earnedToday = (pet.lastActiveDay === today ? pet.xpOnLastActiveDay : 0) + gained

  return {
    pet: { ...pet, xp, level, stage, streak, lastActiveDay: today, xpOnLastActiveDay: earnedToday },
    gained,
    base,
    mastered,
    recovery,
    multiplier,
    capped: gained < raw,
    levelsGained: level - pet.level,
    stageChanged: stage !== pet.stage,
  }
}

/**
 * Bonus ponctuel d'une bonne note : hors plafond quotidien et sans effet sur
 * le streak. Une mauvaise note ne retire rien.
 */
export function applyGradeBonus(pet: PetState, amount: number): { pet: PetState; gained: number; levelsGained: number; stageChanged: boolean } {
  if (amount <= 0) return { pet, gained: 0, levelsGained: 0, stageChanged: false }
  const xp = pet.xp + amount
  const level = Math.max(pet.level, levelForXp(xp))
  const stage = Math.max(pet.stage, stageIndexForLevel(level))
  return { pet: { ...pet, xp, level, stage }, gained: amount, levelsGained: level - pet.level, stageChanged: stage !== pet.stage }
}
