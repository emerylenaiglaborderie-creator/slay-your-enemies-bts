import { describe, expect, it } from 'vitest'
import { daysUntil, todayIso } from '.'

describe('dates de l’API', () => {
  const now = new Date(2026, 9, 13, 23, 30)

  it('compte les jours calendaires jusqu’à une date', () => {
    expect(daysUntil('2026-10-13', now)).toBe(0)
    expect(daysUntil('2026-10-14', now)).toBe(1)
    expect(daysUntil('2026-10-10', now)).toBe(-3)
  })

  it('formate le jour pour un champ date', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
