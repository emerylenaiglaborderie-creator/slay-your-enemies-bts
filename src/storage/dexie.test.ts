import { describe, expect, it } from 'vitest'
import type { Card, Review } from '../domain/types'
import { createDexieStorage } from './dexie'

const card = (id: string, courseId: string): Card => ({ id, courseId, type: 'flashcard', front: 'q', back: 'r', createdAt: 0 })
const review = (id: string, cardId: string): Review => ({ id, cardId, date: 0, nextDue: 0, result: 'good', interval: 1, ease: 2.5 })

describe('stockage Dexie', () => {
  it('enregistre et relit une collection', async () => {
    const s = createDexieStorage(`test-${crypto.randomUUID()}`)
    await s.subjects.put({ id: 's1', name: 'Maths', color: '#000' })
    expect(await s.subjects.get('s1')).toEqual({ id: 's1', name: 'Maths', color: '#000' })
    await s.subjects.remove('s1')
    expect(await s.subjects.list()).toEqual([])
  })

  it('supprime un cours en cascade', async () => {
    const s = createDexieStorage(`test-${crypto.randomUUID()}`)
    await s.courses.bulkPut([
      { id: 'c1', subjectId: 's', title: 'A', markdown: '', createdAt: 0 },
      { id: 'c2', subjectId: 's', title: 'B', markdown: '', createdAt: 0 },
    ])
    await s.cards.bulkPut([card('k1', 'c1'), card('k2', 'c2')])
    await s.reviews.bulkPut([review('r1', 'k1'), review('r2', 'k2')])
    await s.deadlines.put({ id: 'd', subjectId: 's', type: 'examen', date: 0, courseIds: ['c1', 'c2'] })

    await s.removeCourse('c1')

    expect((await s.courses.list()).map((c) => c.id)).toEqual(['c2'])
    expect((await s.cards.list()).map((c) => c.id)).toEqual(['k2'])
    expect((await s.reviews.list()).map((r) => r.id)).toEqual(['r2'])
    expect((await s.deadlines.get('d'))?.courseIds).toEqual(['c2'])
  })
})
