import { create } from 'zustand'
import type { Subject } from '../domain/types'
import { getStorage } from '../storage'

/** Couleurs de matière de la DA, pour les badges et barres de progression. */
export const SUBJECT_COLORS = ['#4db6ac', '#f06292', '#64b5f6', '#81c784', '#ff8a65', '#ffd54f']

type SubjectsState = {
  subjects: Subject[]
  load(): Promise<void>
  addSubject(name: string, color: string): Promise<Subject>
  updateSubject(subject: Subject): Promise<void>
  removeSubject(id: string): Promise<void>
}

export const useSubjectsStore = create<SubjectsState>()((set) => ({
  subjects: [],
  async load() {
    const subjects = await getStorage().subjects.list()
    set({ subjects: subjects.sort((a, b) => a.name.localeCompare(b.name, 'fr')) })
  },
  async addSubject(name, color) {
    const subject: Subject = { id: crypto.randomUUID(), name: name.trim(), color }
    await getStorage().subjects.put(subject)
    set((s) => ({ subjects: [...s.subjects, subject].sort((a, b) => a.name.localeCompare(b.name, 'fr')) }))
    return subject
  },
  async updateSubject(subject) {
    await getStorage().subjects.put(subject)
    set((s) => ({ subjects: s.subjects.map((x) => (x.id === subject.id ? subject : x)) }))
  },
  async removeSubject(id) {
    await getStorage().subjects.remove(id)
    set((s) => ({ subjects: s.subjects.filter((x) => x.id !== id) }))
  },
}))
