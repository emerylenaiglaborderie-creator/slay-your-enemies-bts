import { create } from 'zustand'
import { GRADE_RULES, earnsGoodGradeBonus, gradeFieldsFromDraft, gradeLevel, type GradeDraft } from '../domain/grades'
import type { Grade } from '../domain/types'
import { getStorage } from '../storage'
import { usePetStore } from './pet'

/** Ce que la saisie d'une note a déclenché, pour l'afficher. */
export type GradeOutcome = { grade: Grade; bonus: number; levelsGained: number; stageChanged: boolean; recovery: boolean }

type GradesState = {
  grades: Grade[]
  load(): Promise<void>
  addGrade(draft: GradeDraft, now?: number): Promise<GradeOutcome>
  updateGrade(id: string, draft: GradeDraft): Promise<void>
  removeGrade(id: string): Promise<void>
}

export const useGradesStore = create<GradesState>()((set) => ({
  grades: [],
  async load() {
    set({ grades: await getStorage().grades.list() })
  },
  async addGrade(draft, now = Date.now()) {
    const grade: Grade = { id: crypto.randomUUID(), ...gradeFieldsFromDraft(draft) }
    await getStorage().grades.put(grade)
    set((s) => ({ grades: [...s.grades, grade] }))
    // Le bonus n'est attribué qu'à la saisie : modifier ou supprimer une note ne le rejoue pas.
    const reward = earnsGoodGradeBonus(grade, now)
      ? await usePetStore.getState().awardBonus(GRADE_RULES.goodGradeBonus)
      : { gained: 0, levelsGained: 0, stageChanged: false }
    return { grade, bonus: reward.gained, levelsGained: reward.levelsGained, stageChanged: reward.stageChanged, recovery: gradeLevel(grade) === 'bad' }
  },
  async updateGrade(id, draft) {
    const grade: Grade = { id, ...gradeFieldsFromDraft(draft) }
    await getStorage().grades.put(grade)
    set((s) => ({ grades: s.grades.map((g) => (g.id === id ? grade : g)) }))
  },
  async removeGrade(id) {
    await getStorage().grades.remove(id)
    set((s) => ({ grades: s.grades.filter((g) => g.id !== id) }))
  },
}))
