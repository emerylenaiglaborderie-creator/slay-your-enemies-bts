import { useCardsStore } from './cards'
import { useCoursesStore } from './courses'
import { useDeadlinesStore } from './deadlines'
import { useGradesStore } from './grades'
import { usePetStore } from './pet'
import { useRemindersStore } from './reminders'
import { useReviewsStore } from './reviews'
import { useSubjectsStore } from './subjects'

export { useCardsStore, useCoursesStore, useDeadlinesStore, useGradesStore, usePetStore, useRemindersStore, useReviewsStore, useSubjectsStore }
export type { GradeOutcome } from './grades'
export { SUBJECT_COLORS } from './subjects'

/** Charge toutes les données locales avant le premier rendu. */
export async function hydrateStores(): Promise<void> {
  await Promise.all([
    useSubjectsStore.getState().load(),
    useCoursesStore.getState().load(),
    useCardsStore.getState().load(),
    useReviewsStore.getState().load(),
    useDeadlinesStore.getState().load(),
    usePetStore.getState().load(),
    useGradesStore.getState().load(),
    useRemindersStore.getState().load(),
  ])
}
