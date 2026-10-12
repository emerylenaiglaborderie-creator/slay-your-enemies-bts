import type { Card, Course, Deadline, Grade, Review, Subject } from '../domain/types'
import type { ReminderSettings } from '../domain/reminders'
import type { PetState } from '../domain/xp'

/** Accès générique à une collection. Indépendant de Dexie pour permettre une synchro plus tard. */
export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  put(item: T): Promise<void>
  bulkPut(items: readonly T[]): Promise<void>
  remove(id: string): Promise<void>
}

export interface AppStorage {
  subjects: Collection<Subject>
  courses: Collection<Course>
  cards: Collection<Card>
  reviews: Collection<Review>
  deadlines: Collection<Deadline>
  grades: Collection<Grade>
  pets: Collection<PetState>
  settings: Collection<ReminderSettings>
  /** Supprime un cours avec ses fiches et leurs révisions, et le retire des échéances. */
  removeCourse(courseId: string): Promise<void>
  /** Supprime une fiche et ses révisions. */
  removeCard(cardId: string): Promise<void>
}
