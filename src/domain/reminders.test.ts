import { describe, expect, it } from 'vitest'
import { addDays, startOfDay } from './dates'
import { cardsDueToday, defaultReminderSettings, reminderContent, reminderTimeToday, shouldNotify } from './reminders'
import type { Card, Deadline, Review } from './types'

const NOW = new Date(2026, 9, 12, 18, 30).getTime()
const on = { ...defaultReminderSettings(), enabled: true, time: '18:00' }

describe('rappels', () => {
  it('lit l’heure du rappel', () => {
    expect(reminderTimeToday('18:00', NOW)).toBe(new Date(2026, 9, 12, 18, 0).getTime())
    expect(reminderTimeToday('25:00', NOW)).toBeNull()
    expect(reminderTimeToday('8h', NOW)).toBeNull()
  })

  it('prévient une fois par jour, après l’heure, s’il y a des fiches', () => {
    expect(shouldNotify(on, 3, NOW)).toBe(true)
    expect(shouldNotify({ ...on, enabled: false }, 3, NOW)).toBe(false)
    expect(shouldNotify(on, 0, NOW)).toBe(false)
    expect(shouldNotify({ ...on, time: '19:00' }, 3, NOW)).toBe(false)
    expect(shouldNotify({ ...on, lastNotifiedDay: startOfDay(NOW) }, 3, NOW)).toBe(false)
    expect(shouldNotify({ ...on, lastNotifiedDay: startOfDay(addDays(NOW, -1)) }, 3, NOW)).toBe(true)
  })

  it('compte les fiches dues jusqu’à la fin de la journée', () => {
    const card = (id: string): Card => ({ id, courseId: 'c', type: 'flashcard', front: id, back: id, createdAt: 0 })
    const review = (cardId: string, nextDue: number): Review => ({ id: cardId, cardId, date: 0, nextDue, result: 'good', interval: 1, ease: 2.5 })
    const tonight = new Date(2026, 9, 12, 23, 0).getTime()
    const tomorrow = startOfDay(addDays(NOW, 1))
    expect(cardsDueToday([card('new'), card('tonight'), card('tomorrow')], [review('tonight', tonight), review('tomorrow', tomorrow)], [], NOW)).toBe(2)
  })

  it('cite l’échéance la plus proche si elle arrive bientôt', () => {
    const d = (id: string, offset: number): Deadline => ({ id, subjectId: 's', type: 'examen', date: addDays(startOfDay(NOW), offset), courseIds: [] })
    expect(reminderContent(4, [d('far', 20), d('near', 3)], NOW).deadline?.deadline.id).toBe('near')
    expect(reminderContent(4, [d('far', 20)], NOW).deadline).toBeUndefined()
  })
})
