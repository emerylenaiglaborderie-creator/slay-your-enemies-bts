import { create } from 'zustand'
import type { Course } from '../domain/types'
import { getStorage } from '../storage'
import { useCardsStore } from './cards'
import { useDeadlinesStore } from './deadlines'
import { useReviewsStore } from './reviews'

type NewCourse = Pick<Course, 'subjectId' | 'title' | 'markdown'>

type CoursesState = {
  courses: Course[]
  load(): Promise<void>
  addCourses(items: readonly NewCourse[]): Promise<Course[]>
  updateCourse(course: Course): Promise<void>
  removeCourse(id: string): Promise<void>
}

export const useCoursesStore = create<CoursesState>()((set) => ({
  courses: [],
  async load() {
    const courses = await getStorage().courses.list()
    set({ courses: courses.sort((a, b) => a.createdAt - b.createdAt) })
  },
  async addCourses(items) {
    const now = Date.now()
    // createdAt croissant pour conserver l'ordre des chapitres.
    const created = items.map((item, i): Course => ({ ...item, id: crypto.randomUUID(), createdAt: now + i }))
    await getStorage().courses.bulkPut(created)
    set((s) => ({ courses: [...s.courses, ...created] }))
    return created
  },
  async updateCourse(course) {
    await getStorage().courses.put(course)
    set((s) => ({ courses: s.courses.map((c) => (c.id === course.id ? course : c)) }))
  },
  async removeCourse(id) {
    await getStorage().removeCourse(id)
    const cardIds = new Set(useCardsStore.getState().cards.filter((c) => c.courseId === id).map((c) => c.id))
    set((s) => ({ courses: s.courses.filter((c) => c.id !== id) }))
    useCardsStore.setState((s) => ({ cards: s.cards.filter((c) => !cardIds.has(c.id)) }))
    useReviewsStore.setState((s) => ({ reviews: s.reviews.filter((r) => !cardIds.has(r.cardId)) }))
    useDeadlinesStore.setState((s) => ({
      deadlines: s.deadlines.map((d) => (d.courseIds.includes(id) ? { ...d, courseIds: d.courseIds.filter((c) => c !== id) } : d)),
    }))
  },
}))
