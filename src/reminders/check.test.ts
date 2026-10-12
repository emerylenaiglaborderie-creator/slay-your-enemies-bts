import { describe, expect, it, vi } from 'vitest'
import { addDays, startOfDay } from '../domain/dates'
import { createDexieStorage } from '../storage/dexie'
import { checkAndNotify } from './check'

const NOW = new Date(2026, 9, 12, 19).getTime()

async function setup(enabled: boolean) {
  const storage = createDexieStorage(`test-${crypto.randomUUID()}`)
  await storage.subjects.put({ id: 's', name: 'Histoire', color: '#000' })
  await storage.cards.put({ id: 'k', courseId: 'c', type: 'flashcard', front: 'q', back: 'r', createdAt: 0 })
  await storage.deadlines.put({ id: 'd', subjectId: 's', type: 'examen', date: addDays(startOfDay(NOW), 2), courseIds: ['c'] })
  await storage.settings.put({ id: 'reminders', enabled, time: '18:00', lastNotifiedDay: null })
  return storage
}

describe('envoi du rappel', () => {
  it('envoie le rappel avec l’échéance proche, une seule fois par jour', async () => {
    const storage = await setup(true)
    const show = vi.fn().mockResolvedValue(undefined)

    expect(await checkAndNotify(storage, show, NOW)).toBe(true)
    expect(show).toHaveBeenCalledWith('Révisions du jour', expect.objectContaining({ body: '1 fiche à réviser aujourd’hui. Examen d’Histoire dans 2 jours.' }))
    expect(await checkAndNotify(storage, show, NOW + 60_000)).toBe(false)
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('ne fait rien si les rappels sont désactivés', async () => {
    const show = vi.fn()
    expect(await checkAndNotify(await setup(false), show, NOW)).toBe(false)
    expect(show).not.toHaveBeenCalled()
  })
})
