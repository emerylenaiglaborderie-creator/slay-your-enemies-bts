import { describe, expect, it } from 'vitest'
import { addDays, startOfDay } from './dates'
import { GRADE_RULES } from './grades'
import { XP_RULES, applyGradeBonus, applySession, createPet, currentStreak, levelForXp, levelProgress, xpForLevel, type PetState, type SessionAnswer } from './xp'

const NOW = new Date(2026, 9, 12, 18).getTime()
const good: SessionAnswer = { previous: undefined, result: 'good' }
const mastered: SessionAnswer = { previous: 'again', result: 'good' }

describe('niveaux', () => {
  it('suit une courbe croissante', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(20)
    expect(xpForLevel(5)).toBe(110)
    expect(levelForXp(109)).toBe(4)
    expect(levelForXp(110)).toBe(5)
    expect(levelProgress(120)).toEqual({ level: 5, current: 10, needed: 40 })
  })
})

describe('XP de session', () => {
  it('donne la base fixe, indépendamment du nombre de fiches', () => {
    const one = applySession(createPet('D'), [good], NOW)
    const many = applySession(createPet('D'), Array.from({ length: 30 }, () => good), NOW)
    expect(one.gained).toBe(XP_RULES.sessionBase)
    expect(many.gained).toBe(one.gained)
  })

  it('récompense la maîtrise : fiches passées de À revoir à Bien', () => {
    const r = applySession(createPet('D'), [mastered, mastered, { previous: 'again', result: 'hard' }], NOW)
    expect(r.mastered).toBe(2)
    expect(r.gained).toBe(XP_RULES.sessionBase + 2 * XP_RULES.masteryBonus)
  })

  it('ne donne rien pour une session vide', () => {
    expect(applySession(createPet('D'), [], NOW).gained).toBe(0)
  })

  it('plafonne l’XP quotidienne', () => {
    let pet = createPet('D')
    let total = 0
    for (let i = 0; i < 10; i++) {
      const r = applySession(pet, Array.from({ length: 10 }, () => mastered), NOW)
      pet = r.pet
      total += r.gained
    }
    expect(total).toBe(XP_RULES.dailyCap)
    // Le plafond repart le lendemain.
    expect(applySession(pet, [good], addDays(NOW, 1)).gained).toBeGreaterThan(0)
  })
})

describe('streak', () => {
  const activeYesterday = (streak: number): PetState => ({ ...createPet('D'), streak, xp: 500, level: levelForXp(500), lastActiveDay: startOfDay(addDays(NOW, -1)) })

  it('augmente avec des jours consécutifs et applique un multiplicateur léger', () => {
    const r = applySession(activeYesterday(4), [good], NOW)
    expect(r.pet.streak).toBe(5)
    expect(r.multiplier).toBeCloseTo(1.2)
    expect(r.gained).toBe(Math.round(XP_RULES.sessionBase * 1.2))
  })

  it('ne compte qu’une fois par jour', () => {
    const first = applySession(activeYesterday(4), [good], NOW)
    expect(applySession(first.pet, [good], NOW).pet.streak).toBe(5)
  })

  it('repart à 1 après une journée manquée, sans toucher à l’XP ni au niveau', () => {
    const pet = { ...activeYesterday(9), lastActiveDay: startOfDay(addDays(NOW, -3)) }
    expect(currentStreak(pet, NOW)).toBe(0)
    const r = applySession(pet, [good], NOW)
    expect(r.pet.streak).toBe(1)
    expect(r.pet.xp).toBeGreaterThan(pet.xp)
    expect(r.pet.level).toBeGreaterThanOrEqual(pet.level)
  })
})

describe('croissance', () => {
  it('fait éclore l’oeuf au niveau 5 et ne régresse jamais', () => {
    const pet: PetState = { ...createPet('D'), xp: xpForLevel(5) - 5, level: 4 }
    const r = applySession(pet, [good], NOW)
    expect(r.pet.level).toBe(5)
    expect(r.levelsGained).toBe(1)
    expect(r.stageChanged).toBe(true)
    expect(r.pet.stage).toBe(1)

    const stored: PetState = { ...createPet('D'), xp: 0, level: 7, stage: 1 }
    expect(applySession(stored, [good], NOW).pet.level).toBe(7)
  })
})

describe('effets des notes', () => {
  it('donne un bonus par fiche réussie de la matière en rattrapage, plafonné', () => {
    const answers: SessionAnswer[] = [
      { previous: undefined, result: 'good', subjectId: 'maths' },
      { previous: undefined, result: 'again', subjectId: 'maths' },
      { previous: undefined, result: 'good', subjectId: 'svt' },
    ]
    const r = applySession(createPet('D'), answers, NOW, ['maths'])
    expect(r.recovery).toBe(GRADE_RULES.recoveryBonusPerCard)
    expect(r.gained).toBe(XP_RULES.sessionBase + GRADE_RULES.recoveryBonusPerCard)

    const many = Array.from({ length: 20 }, (): SessionAnswer => ({ previous: undefined, result: 'good', subjectId: 'maths' }))
    expect(applySession(createPet('D'), many, NOW, ['maths']).recovery).toBe(GRADE_RULES.recoveryBonusMax)
  })

  it('applique le bonus de bonne note hors plafond, sans toucher au streak', () => {
    const pet = { ...createPet('D'), lastActiveDay: startOfDay(NOW), xpOnLastActiveDay: XP_RULES.dailyCap, streak: 3 }
    const r = applyGradeBonus(pet, GRADE_RULES.goodGradeBonus)
    expect(r.pet.xp).toBe(GRADE_RULES.goodGradeBonus)
    expect(r.pet.streak).toBe(3)
    expect(r.pet.xpOnLastActiveDay).toBe(XP_RULES.dailyCap)
    expect(r.levelsGained).toBe(1)
  })
})
