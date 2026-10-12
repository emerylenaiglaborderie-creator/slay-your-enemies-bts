import { describe, expect, it } from 'vitest'
import { addDays, fromDateInput, startOfDay, toDateInput } from './dates'
import { daysUntil, deadlineFieldsFromDraft, pastDeadlines, upcomingDeadlines, validateDeadlineDraft, type DeadlineDraft } from './deadlines'
import type { Deadline } from './types'

const NOW = new Date(2026, 9, 12, 15, 30).getTime()
const draft = (patch: Partial<DeadlineDraft> = {}): DeadlineDraft => ({
  subjectId: 's',
  type: 'controle',
  date: '2026-10-20',
  courseIds: ['c1'],
  ...patch,
})
const deadline = (id: string, date: number): Deadline => ({ id, subjectId: 's', type: 'examen', date, courseIds: [] })

describe('échéances', () => {
  it('convertit les dates du champ date en minuit local', () => {
    expect(fromDateInput('2026-10-20')).toBe(new Date(2026, 9, 20).getTime())
    expect(toDateInput(NOW)).toBe('2026-10-12')
    expect(fromDateInput('20/10/2026')).toBeNull()
  })

  it('valide matière et date, et refuse une date passée', () => {
    expect(validateDeadlineDraft(draft(), NOW)).toEqual([])
    expect(validateDeadlineDraft(draft({ date: '2026-10-12' }), NOW)).toEqual([])
    expect(validateDeadlineDraft(draft({ date: '2026-10-11' }), NOW)).toEqual(['dateInPast'])
    expect(validateDeadlineDraft(draft({ subjectId: '', date: '' }), NOW)).toEqual(['subjectRequired', 'dateRequired'])
  })

  it('dédoublonne les cours liés', () => {
    expect(deadlineFieldsFromDraft(draft({ courseIds: ['a', 'a', 'b'] })).courseIds).toEqual(['a', 'b'])
  })

  it('compte les jours restants', () => {
    expect(daysUntil({ date: startOfDay(NOW) }, NOW)).toBe(0)
    expect(daysUntil({ date: addDays(startOfDay(NOW), 1) }, NOW)).toBe(1)
    expect(daysUntil({ date: addDays(startOfDay(NOW), -2) }, NOW)).toBe(-2)
  })

  it('sépare les échéances à venir (dont aujourd’hui) et passées', () => {
    const today = startOfDay(NOW)
    const list = [deadline('far', addDays(today, 9)), deadline('past', addDays(today, -1)), deadline('today', today), deadline('old', addDays(today, -9))]
    expect(upcomingDeadlines(list, NOW).map((d) => d.id)).toEqual(['today', 'far'])
    expect(pastDeadlines(list, NOW).map((d) => d.id)).toEqual(['past', 'old'])
  })
})
