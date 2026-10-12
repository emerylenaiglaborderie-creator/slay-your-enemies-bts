import { GRADE_RULES, type RecoveryPlan } from '../domain/grades'
import { useDueCards } from '../hooks/useDueCards'
import { useSubjectMap } from '../hooks/useLookups'
import { formatDate, t } from '../i18n'
import { ButtonLink } from './Button'
import { SubjectBadge } from './SubjectBadge'

export function RecoveryPlanCard({ plan }: { plan: RecoveryPlan }) {
  const subjects = useSubjectMap()
  const due = useDueCards({ subjectId: plan.subjectId })
  return (
    <article className="px-box px-box-lg [--frame:var(--color-xp)] flex flex-col gap-1 p-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-pixel font-semibold text-xp">{t.grades.recoveryTitle}</span>
        <SubjectBadge subject={subjects.get(plan.subjectId)} />
      </div>
      <p className="text-sm text-ink-muted">
        {t.grades.recoveryText(GRADE_RULES.recoveryBonusPerCard, GRADE_RULES.recoveryBonusMax)} {t.grades.recoveryUntil(formatDate(plan.until))}
      </p>
      <ButtonLink to={`/reviser?matiere=${plan.subjectId}`} variant="primary" className="self-start px-1.5 py-0.5 text-sm">
        {t.grades.recoveryReview(due.length)}
      </ButtonLink>
    </article>
  )
}
