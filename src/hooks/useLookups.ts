import { useMemo } from 'react'
import type { Course, Subject } from '../domain/types'
import { useCoursesStore, useSubjectsStore } from '../stores'

export function useSubjectMap(): Map<string, Subject> {
  const subjects = useSubjectsStore((s) => s.subjects)
  return useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
}

export function useCourseMap(): Map<string, Course> {
  const courses = useCoursesStore((s) => s.courses)
  return useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
}
