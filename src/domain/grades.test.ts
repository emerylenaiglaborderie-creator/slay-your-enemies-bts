import { describe, expect, it } from 'vitest'
import { addDays, startOfDay } from './dates'
import { GRADE_RULES, activeRecoveryPlans, earnsGoodGradeBonus, gradeLevel, parseNumber, validateGradeDraft, weightedAverage, type GradeDraft } from './grades'
import type { Grade } from './types'

const NOW = new Date(2026, 9, 12, 18).getTime()
const day = (offset: number) => addDays(startOfDay(NOW), offset)
const grade = (id: string, value: number, offset: number, patch: Partial<Grade> = {}): Grade => ({ id, subjectId: 's', value, max: 20, coef: 1, date: day(offset), ...patch })
const draft = (patch: Partial<GradeDraft> = {}): GradeDraft => ({ subjectId: 's', value: '12,5', max: '20', coef: '1', date: '2026-10-12', ...patch })

describe('saisie des notes', () => {
  it('accepte la virgule décimale', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })

  it('valide valeur, barème, coefficient et date', () => {
    expect(validateGradeDraft(draft(), NOW)).toEqual([])
    expect(validateGradeDraft(draft({ value: '21' }), NOW)).toEqual(['valueInvalid'])
    expect(validateGradeDraft(draft({ max: '0', coef: '0' }), NOW)).toEqual(['maxInvalid', 'coefInvalid'])
    expect(validateGradeDraft(draft({ date: '2026-10-13' }), NOW)).toEqual(['dateInFuture'])
    expect(validateGradeDraft(draft({ subjectId: '', date: '' }), NOW)).toEqual(['subjectRequired', 'dateRequired'])
  })
})

describe('calculs', () => {
  it('classe les notes ramenées sur 20', () => {
    expect(gradeLevel({ value: 14, max: 20 })).toBe('good')
    expect(gradeLevel({ value: 7, max: 10 })).toBe('good')
    expect(gradeLevel({ value: 10, max: 20 })).toBe('neutral')
    expect(gradeLevel({ value: 9.5, max: 20 })).toBe('bad')
  })

  it('calcule une moyenne pondérée sur 20', () => {
    expect(weightedAverage([grade('a', 10, 0, { coef: 1 }), grade('b', 16, 0, { coef: 2 })])).toBe(14)
    expect(weightedAverage([grade('a', 5, 0, { max: 10 })])).toBe(10)
    expect(weightedAverage([])).toBeNull()
  })

  it('réserve le bonus aux bonnes notes récentes', () => {
    expect(earnsGoodGradeBonus(grade('a', 16, -3), NOW)).toBe(true)
    expect(earnsGoodGradeBonus(grade('a', 16, -(GRADE_RULES.bonusMaxAgeDays + 1)), NOW)).toBe(false)
    expect(earnsGoodGradeBonus(grade('a', 12, 0), NOW)).toBe(false)
  })
})

describe('plan de rattrapage', () => {
  it('s’ouvre après une mauvaise note et dure quelques jours', () => {
    const plans = activeRecoveryPlans([grade('bad', 6, -2)], NOW)
    expect(plans).toEqual([{ subjectId: 's', gradeId: 'bad', until: day(-2 + GRADE_RULES.recoveryDays) }])
    expect(activeRecoveryPlans([grade('bad', 6, -GRADE_RULES.recoveryDays)], NOW)).toEqual([])
  })

  it('se ferme quand une note plus récente n’est plus mauvaise', () => {
    expect(activeRecoveryPlans([grade('bad', 6, -5), grade('ok', 11, -1)], NOW)).toEqual([])
    expect(activeRecoveryPlans([grade('ok', 11, -5), grade('bad', 6, -1)], NOW).map((p) => p.gradeId)).toEqual(['bad'])
  })

  it('reste ouvert si une bonne note est saisie le même jour', () => {
    expect(activeRecoveryPlans([grade('good', 16, 0), grade('bad', 6, 0)], NOW).map((p) => p.gradeId)).toEqual(['bad'])
  })

  it('est propre à chaque matière', () => {
    const plans = activeRecoveryPlans([grade('a', 6, -1, { subjectId: 'maths' }), grade('b', 15, -1, { subjectId: 'svt' })], NOW)
    expect(plans.map((p) => p.subjectId)).toEqual(['maths'])
  })
})
