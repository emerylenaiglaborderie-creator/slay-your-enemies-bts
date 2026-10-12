import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, ButtonLink } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SelectField } from '../components/Field'
import { ReviewSession } from '../components/review/ReviewSession'
import type { Card } from '../domain/types'
import { useDueCards } from '../hooks/useDueCards'
import { useCourseMap } from '../hooks/useLookups'
import { formatDate, t } from '../i18n'
import { useDeadlinesStore, useSubjectsStore } from '../stores'

export function ReviewPage() {
  const [params, setParams] = useSearchParams()
  const courseId = params.get('cours') ?? undefined
  const subjectId = params.get('matiere') ?? undefined
  const deadlineId = params.get('echeance') ?? undefined
  const subjects = useSubjectsStore((s) => s.subjects)
  const courses = useCourseMap()
  const due = useDueCards({ courseId, subjectId, deadlineId })
  const deadline = useDeadlinesStore((s) => s.deadlines.find((d) => d.id === deadlineId))
  // File figée au lancement : les fiches notées ne bougent plus pendant la session.
  const [session, setSession] = useState<Card[] | null>(null)

  if (session) return <ReviewSession cards={session} onExit={() => setSession(null)} />

  const course = courseId ? courses.get(courseId) : undefined

  return (
    <>
      <h1 className="text-2xl">{t.review.title}</h1>
      {course || deadline ? (
        <p className="flex flex-wrap items-center gap-1">
          <span className="font-semibold">
            {deadline ? `${t.deadlines.types[deadline.type]}, ${formatDate(deadline.date)}` : course?.title}
          </span>
          <ButtonLink to="/reviser" variant="ghost">
            {t.common.allSubjects}
          </ButtonLink>
        </p>
      ) : (
        subjects.length > 1 && (
          <div className="max-w-sm">
            <SelectField
              label={t.common.subject}
              value={subjectId ?? ''}
              onChange={(e) => setParams(e.target.value ? { matiere: e.target.value } : {})}
            >
              <option value="">{t.common.allSubjects}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
        )
      )}
      {due.length === 0 ? (
        <EmptyState title={t.review.allDoneTitle}>
          <p className="text-ink-muted">{t.review.allDoneText}</p>
        </EmptyState>
      ) : (
        <div className="px-box px-box-lg flex flex-col items-start gap-2 p-3">
          <p className="font-pixel text-xl">{t.review.dueToday(due.length)}</p>
          <Button variant="primary" autoFocus onClick={() => setSession(due)}>
            {t.review.start}
          </Button>
        </div>
      )}
    </>
  )
}
