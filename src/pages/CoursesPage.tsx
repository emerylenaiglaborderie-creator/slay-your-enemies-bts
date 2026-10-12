import { ButtonLink } from '../components/Button'
import { CourseTile } from '../components/CourseTile'
import { DeadlineCard } from '../components/DeadlineCard'
import { RecoveryPlanCard } from '../components/RecoveryPlanCard'
import { EmptyState } from '../components/EmptyState'
import { SubjectBadge } from '../components/SubjectBadge'
import { upcomingDeadlines } from '../domain/deadlines'
import { useDueCards } from '../hooks/useDueCards'
import { useNow } from '../hooks/useNow'
import { useRecoveryPlans } from '../hooks/useRecoveryPlans'
import { t } from '../i18n'
import { useCardsStore, useCoursesStore, useDeadlinesStore, useSubjectsStore } from '../stores'

export function CoursesPage() {
  const courses = useCoursesStore((s) => s.courses)
  const subjects = useSubjectsStore((s) => s.subjects)
  const cards = useCardsStore((s) => s.cards)
  const due = useDueCards()
  const plans = useRecoveryPlans()
  const now = useNow()
  const nextDeadlines = upcomingDeadlines(useDeadlinesStore((s) => s.deadlines), now).slice(0, 2)

  const countByCourse = new Map<string, number>()
  for (const card of cards) countByCourse.set(card.courseId, (countByCourse.get(card.courseId) ?? 0) + 1)
  const dueByCourse = new Map<string, number>()
  for (const card of due) dueByCourse.set(card.courseId, (dueByCourse.get(card.courseId) ?? 0) + 1)

  const groups = [
    ...subjects.map((subject) => ({ subject, courses: courses.filter((c) => c.subjectId === subject.id) })),
    { subject: undefined, courses: courses.filter((c) => !subjects.some((s) => s.id === c.subjectId)) },
  ].filter((g) => g.courses.length > 0)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">{t.courses.title}</h1>
        <div className="flex gap-1">
          {due.length > 0 && (
            <ButtonLink to="/reviser" variant="primary">
              {t.review.dueToday(due.length)}
            </ButtonLink>
          )}
          <ButtonLink to="/importer">{t.courses.import}</ButtonLink>
        </div>
      </div>

      {plans.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {plans.map((plan) => (
            <li key={plan.gradeId}>
              <RecoveryPlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}

      {nextDeadlines.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-1">
            <h2 className="text-lg">{t.deadlines.upcoming}</h2>
            <ButtonLink to="/echeances" variant="ghost" className="shrink-0 text-sm">
              {t.deadlines.seeAll}
            </ButtonLink>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {nextDeadlines.map((d) => (
              <li key={d.id}>
                <DeadlineCard deadline={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {courses.length === 0 ? (
        <EmptyState title={t.courses.emptyTitle}>
          <p className="text-ink-muted">{t.courses.emptyText}</p>
          <ButtonLink to="/importer" variant="primary">
            {t.courses.import}
          </ButtonLink>
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.subject?.id ?? 'none'} className="flex flex-col gap-1">
            <h2 className="flex items-center gap-1 text-lg">
              <SubjectBadge subject={group.subject} />
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.courses.map((course) => (
                <li key={course.id}>
                  <CourseTile
                    course={course}
                    subject={group.subject}
                    cardCount={countByCourse.get(course.id) ?? 0}
                    dueCount={dueByCourse.get(course.id) ?? 0}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
