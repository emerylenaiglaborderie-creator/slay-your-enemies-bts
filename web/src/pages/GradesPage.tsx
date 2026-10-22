import { useState } from 'react'
import type { ClassDetail, ClassSummary, Evaluation, Grade, MyGrades, MyPet, RecoveryPlan } from '../api/client'
import { useApi } from '../api/useApi'
import { ClassPicker } from '../components/ClassPicker'
import { ErrorText } from '../components/Feedback'
import { GradeBook } from '../components/GradeBook'
import { Tile } from '../components/Tile'
import { Panel } from '../components/Panel'
import { formatDay, t } from '../i18n'
import { useAuthStore } from '../stores/auth'

export function GradesPage() {
  const isTrainer = useAuthStore((s) => s.user)!.role === 'trainer'
  return isTrainer ? <TrainerGrades /> : <StudentGrades />
}

function TrainerGrades() {
  const { data: classes } = useApi<ClassSummary[]>('/classes')
  const [classId, setClassId] = useState<string>()
  const { data: detail } = useApi<ClassDetail>(classId ? `/classes/${classId}` : null)
  const { data: grades, reload } = useApi<Grade[]>(classId ? `/classes/${classId}/grades` : null)
  const { data: evaluations } = useApi<Evaluation[]>('/evaluations')

  return (
    <>
      <h1 className="text-2xl">{t.grades.title}</h1>
      {classes?.length === 0 && <p className="text-ink-muted">{t.common.noClassTrainer}</p>}
      {classes && <ClassPicker classes={classes} value={classId} onChange={setClassId} />}
      {detail && grades && detail.id === classId && (
        <GradeBook key={detail.id} detail={detail} grades={grades} evaluations={evaluations?.filter((e) => e.class_id === detail.id) ?? []} onChanged={reload} />
      )}
    </>
  )
}

export function RecoveryPlanCard({ plan, perAnswer, max }: { plan: RecoveryPlan; perAnswer: number; max: number }) {
  return (
    <article className="px-box px-box-lg flex flex-col gap-0.5 p-1.5 [--frame:var(--color-xp)]">
      <span className="font-pixel font-semibold text-xp">
        {t.grades.recoveryTitle} · {plan.subject}
      </span>
      <p className="text-sm text-ink-muted">
        {t.grades.recoveryText(plan.subject, perAnswer, max)} {t.grades.recoveryUntil(formatDay(plan.until))}
        {plan.target !== null && ` · ${t.grades.recoveryGoal(plan.target)}`}
      </p>
    </article>
  )
}

function StudentGrades() {
  const { data, error } = useApi<MyGrades>('/me/grades')
  const { data: pet } = useApi<MyPet>('/me/pet')
  return (
    <>
      <h1 className="text-2xl">{t.grades.myTitle}</h1>
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          {data.average !== null && (
            <Panel className="flex items-center justify-between">
              <span className="font-semibold">{t.grades.average}</span>
              <span className="text-2xl font-bold tabular-nums">{t.grades.averageValue(data.average)}</span>
            </Panel>
          )}
          {pet &&
            data.recovery_plans.map((plan) => (
              <RecoveryPlanCard key={plan.subject} plan={plan} perAnswer={pet.rules.recovery_bonus_per_answer} max={pet.rules.recovery_bonus_max} />
            ))}
          {data.grades.length === 0 ? (
            <p className="text-ink-muted">{t.grades.none}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.grades.map((g) => {
                const score = (g.value / g.max) * 20
                return (
                  <Tile
                    key={g.id}
                    icon="grades"
                    accent={score >= 14 ? 'var(--color-success)' : score < 10 ? 'var(--color-danger)' : 'var(--color-accent-soft)'}
                    title={g.evaluation_title ?? g.subject}
                    subtitle={`${formatDay(g.graded_on)} · ${g.class_name} · ${t.grades.coefShort(g.coef)}`}
                    aside={<span className="text-lg font-bold tabular-nums">{t.grades.gradeValue(g.value, g.max)}</span>}
                  />
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}
