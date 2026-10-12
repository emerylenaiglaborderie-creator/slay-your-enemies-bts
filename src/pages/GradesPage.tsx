import { useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { GradeForm } from '../components/GradeForm'
import { Panel } from '../components/Panel'
import { RecoveryPlanCard } from '../components/RecoveryPlanCard'
import { SubjectBadge } from '../components/SubjectBadge'
import { toDateInput } from '../domain/dates'
import { gradeLevel, weightedAverage } from '../domain/grades'
import type { Grade } from '../domain/types'
import { useSubjectMap } from '../hooks/useLookups'
import { useRecoveryPlans } from '../hooks/useRecoveryPlans'
import { formatDate, t } from '../i18n'
import { useGradesStore, usePetStore, useSubjectsStore, type GradeOutcome } from '../stores'

const levelTone = { good: 'text-success', neutral: 'text-ink', bad: 'text-danger' } as const

function outcomeMessage(outcome: GradeOutcome, petName: string, subjectName: string): string {
  if (outcome.bonus > 0) return t.grades.outcomeBonus(petName, outcome.bonus)
  if (outcome.recovery) return t.grades.outcomeRecovery(subjectName)
  if (gradeLevel(outcome.grade) === 'good') return t.grades.outcomeOldGood
  return t.grades.outcomeSaved
}

function GradeRow({ grade }: { grade: Grade }) {
  const { updateGrade, removeGrade } = useGradesStore()
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <li className="px-box bg-surface-2 p-1.5">
        <GradeForm
          initial={{ subjectId: grade.subjectId, value: String(grade.value), max: String(grade.max), coef: String(grade.coef), date: toDateInput(grade.date) }}
          onSubmit={async (draft) => {
            await updateGrade(grade.id, draft)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }
  return (
    <li className="flex items-center justify-between gap-1 border-b-2 border-border py-0.5 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={`text-lg font-bold tabular-nums ${levelTone[gradeLevel(grade)]}`}>{t.grades.gradeValue(grade.value, grade.max)}</span>
        <span className="text-sm text-ink-muted">
          {t.grades.coefShort(grade.coef)} · {formatDate(grade.date)}
        </span>
      </div>
      <div className="flex shrink-0 text-sm">
        <Button variant="ghost" className="px-1 py-0.5" onClick={() => setEditing(true)}>
          {t.common.edit}
        </Button>
        <Button
          variant="ghost"
          className="px-1 py-0.5"
          onClick={() => {
            if (confirm(t.grades.deleteConfirm)) void removeGrade(grade.id)
          }}
        >
          {t.common.delete}
        </Button>
      </div>
    </li>
  )
}

export function GradesPage() {
  const grades = useGradesStore((s) => s.grades)
  const addGrade = useGradesStore((s) => s.addGrade)
  const petName = usePetStore((s) => s.pet.name)
  const subjects = useSubjectsStore((s) => s.subjects)
  const subjectMap = useSubjectMap()
  const plans = useRecoveryPlans()
  const [outcome, setOutcome] = useState<string | null>(null)

  const groups = subjects
    .map((subject) => ({ subject, grades: grades.filter((g) => g.subjectId === subject.id).sort((a, b) => b.date - a.date) }))
    .filter((g) => g.grades.length > 0)

  return (
    <>
      <h1 className="text-2xl">{t.grades.title}</h1>

      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.grades.new}</h2>
        <GradeForm
          submitLabel={t.common.add}
          onSubmit={async (draft) => {
            const result = await addGrade(draft)
            setOutcome(outcomeMessage(result, petName, subjectMap.get(result.grade.subjectId)?.name ?? ''))
          }}
        />
        {outcome && (
          <p role="status" className="font-semibold text-accent-soft">
            {outcome}
          </p>
        )}
      </Panel>

      {plans.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {plans.map((plan) => (
            <li key={plan.gradeId}>
              <RecoveryPlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}

      {groups.length === 0 ? (
        <EmptyState title={t.grades.emptyTitle}>
          <p className="max-w-md text-ink-muted">{t.grades.emptyText}</p>
        </EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map(({ subject, grades: list }) => {
            const average = weightedAverage(list)
            return (
              <Panel key={subject.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  <SubjectBadge subject={subject} />
                  {average !== null && (
                    <span className="text-sm text-ink-muted">
                      {t.grades.average} <strong className="text-base text-ink tabular-nums">{t.grades.averageValue(average)}</strong>
                    </span>
                  )}
                </div>
                <ul className="flex flex-col">
                  {list.map((g) => (
                    <GradeRow key={g.id} grade={g} />
                  ))}
                </ul>
              </Panel>
            )
          })}
        </div>
      )}
    </>
  )
}
