import Dexie, { type Table } from 'dexie'
import type { Card, Course, Deadline, Grade, Review, Subject } from '../domain/types'
import type { ReminderSettings } from '../domain/reminders'
import type { PetState } from '../domain/xp'
import type { AppStorage, Collection } from './types'

class RevisionDb extends Dexie {
  subjects!: Table<Subject, string>
  courses!: Table<Course, string>
  cards!: Table<Card, string>
  reviews!: Table<Review, string>
  deadlines!: Table<Deadline, string>
  grades!: Table<Grade, string>
  pets!: Table<PetState, string>
  settings!: Table<ReminderSettings, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      subjects: 'id, name',
      courses: 'id, subjectId, createdAt',
      cards: 'id, courseId, type, createdAt',
      reviews: 'id, cardId, date, nextDue',
      deadlines: 'id, subjectId, date, *courseIds',
      grades: 'id, subjectId, date',
      pets: 'id',
    })
    // v2 : réglages (rappels), lisibles aussi par le service worker.
    this.version(2).stores({ settings: 'id' })
  }
}

function collection<T extends { id: string }>(table: Table<T, string>): Collection<T> {
  return {
    list: () => table.toArray(),
    get: (id) => table.get(id),
    put: async (item) => {
      await table.put(item)
    },
    bulkPut: async (items) => {
      await table.bulkPut([...items])
    },
    remove: (id) => table.delete(id),
  }
}

// Nom distinct du projet d'origine : les deux peuvent tourner dans le même navigateur.
export function createDexieStorage(name = 'slay-your-enemies-bts'): AppStorage {
  const db = new RevisionDb(name)
  return {
    subjects: collection(db.subjects),
    courses: collection(db.courses),
    cards: collection(db.cards),
    reviews: collection(db.reviews),
    deadlines: collection(db.deadlines),
    grades: collection(db.grades),
    pets: collection(db.pets),
    settings: collection(db.settings),
    removeCourse: (courseId) =>
      db.transaction('rw', [db.courses, db.cards, db.reviews, db.deadlines], async () => {
        const cardIds = (await db.cards.where('courseId').equals(courseId).primaryKeys()) as string[]
        await db.reviews.where('cardId').anyOf(cardIds).delete()
        await db.cards.bulkDelete(cardIds)
        await db.deadlines
          .where('courseIds')
          .equals(courseId)
          .modify((d) => {
            d.courseIds = d.courseIds.filter((id) => id !== courseId)
          })
        await db.courses.delete(courseId)
      }),
    removeCard: (cardId) =>
      db.transaction('rw', [db.cards, db.reviews], async () => {
        await db.reviews.where('cardId').equals(cardId).delete()
        await db.cards.delete(cardId)
      }),
  }
}
