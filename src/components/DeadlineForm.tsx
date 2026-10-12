import { useState, type FormEvent } from 'react'
import { addDays, startOfDay, toDateInput } from '../domain/dates'
import { DEADLINE_TYPES, validateDeadlineDraft, type DeadlineDraft } from '../domain/deadlines'
import { useNow } from '../hooks/useNow'
import { t } from '../i18n'
import { useCoursesStore, useSubjectsStore } from '../stores'
import { Button } from './Button'
import { SelectField, TextField } from './Field'

type Props = {
  initial?: DeadlineDraft
  submitLabel?: string
  onSubmit(draft: DeadlineDraft): Promise<void>
  onCancel?(): void
}

export function DeadlineForm({ initial, submitLabel = t.common.save, onSubmit, onCancel }: Props) {
  const now = useNow()
  const subjects = useSubjectsStore((s) => s.subjects)
  const courses = useCoursesStore((s) => s.courses)
  const [draft, setDraft] = useState<DeadlineDraft>(() => {
    if (initial) return initial
    const subjectId = subjects[0]?.id ?? ''
    return {
      subjectId,
      type: 'controle',
      date: toDateInput(addDays(startOfDay(now), 7)),
      courseIds: courses.filter((c) => c.subjectId === subjectId).map((c) => c.id),
    }
  })
  const [submitted, setSubmitted] = useState(false)
  const errors = validateDeadlineDraft(draft, now)
  const errorFor = (key: (typeof errors)[number]) => (submitted && errors.includes(key) ? t.deadlines.errors[key] : undefined)
  const subjectCourses = courses.filter((c) => c.subjectId === draft.subjectId)

  function changeSubject(subjectId: string) {
    // Par défaut, une échéance couvre tous les cours de sa matière.
    setDraft((d) => ({ ...d, subjectId, courseIds: courses.filter((c) => c.subjectId === subjectId).map((c) => c.id) }))
  }

  function toggleCourse(courseId: string, checked: boolean) {
    setDraft((d) => ({ ...d, courseIds: checked ? [...d.courseIds, courseId] : d.courseIds.filter((id) => id !== courseId) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (errors.length > 0) return
    await onSubmit({ ...draft, courseIds: draft.courseIds.filter((id) => subjectCourses.some((c) => c.id === id)) })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <div className="grid gap-2 sm:grid-cols-3">
        <SelectField label={t.deadlines.type} value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as DeadlineDraft['type'] }))}>
          {DEADLINE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t.deadlines.types[type]}
            </option>
          ))}
        </SelectField>
        <SelectField label={t.common.subject} value={draft.subjectId} onChange={(e) => changeSubject(e.target.value)} error={errorFor('subjectRequired')}>
          {subjects.length === 0 && <option value="">{t.subjects.empty}</option>}
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField
          type="date"
          label={t.deadlines.date}
          value={draft.date}
          min={toDateInput(now)}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          error={errorFor('dateRequired') ?? errorFor('dateInPast')}
        />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-0.5 text-sm font-semibold">{t.deadlines.courses}</legend>
        {subjectCourses.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.deadlines.noCourses}</p>
        ) : (
          <>
            <ul className="grid gap-0.5 sm:grid-cols-2">
              {subjectCourses.map((course) => (
                <li key={course.id}>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={draft.courseIds.includes(course.id)}
                      onChange={(e) => toggleCourse(course.id, e.target.checked)}
                      className="size-2 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span>{course.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            {draft.courseIds.length < subjectCourses.length && (
              <Button variant="ghost" className="self-start" onClick={() => setDraft((d) => ({ ...d, courseIds: subjectCourses.map((c) => c.id) }))}>
                {t.deadlines.allCourses}
              </Button>
            )}
          </>
        )}
        {draft.courseIds.length === 0 && <p className="text-sm text-ink-muted">{t.deadlines.noCoursesHint}</p>}
      </fieldset>

      <div className="flex gap-1">
        <Button type="submit" variant="primary" disabled={subjects.length === 0}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>{t.common.cancel}</Button>}
      </div>
    </form>
  )
}
