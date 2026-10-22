import { useState } from 'react'
import type { ClassSummary, Dashboard, StudentCard } from '../api/client'
import { useApi } from '../api/useApi'
import { ClassPicker } from '../components/ClassPicker'
import { DragonSprite } from '../components/DragonSprite'
import { ErrorText } from '../components/Feedback'
import { SelectField } from '../components/Field'
import { LevelBadge, StreakBadge, XpBar } from '../components/PetStats'
import { PET_STAGES } from '../domain/pet-stages'
import { daysUntil, t } from '../i18n'

type Sort = keyof typeof t.dashboard.sorts

const STAGE_COLOR: Record<string, string> = { egg: 'var(--color-accent-soft)', baby: 'var(--color-xp)', young: 'var(--color-success)' }

/** Jours depuis la dernière activité (quiz), null si jamais actif. */
function idleDays(s: StudentCard): number | null {
  return s.pet.last_active_day === null ? null : -daysUntil(s.pet.last_active_day)
}

const sorters: Record<Sort, (a: StudentCard, b: StudentCard) => number> = {
  name: (a, b) => a.display_name.localeCompare(b.display_name, 'fr'),
  level: (a, b) => b.pet.xp - a.pet.xp,
  average: (a, b) => (b.average ?? -1) - (a.average ?? -1),
  activity: (a, b) => (idleDays(b) ?? Infinity) - (idleDays(a) ?? Infinity),
}

export function DashboardPage() {
  const { data: classes } = useApi<ClassSummary[]>('/classes')
  const [classId, setClassId] = useState<string>()
  const [sort, setSort] = useState<Sort>('name')
  const { data, error } = useApi<Dashboard>(classId ? `/classes/${classId}/dashboard` : null)

  const students = data ? [...data.students].sort(sorters[sort]) : []
  const graded = students.filter((s) => s.average !== null)
  const classAverage = graded.length > 0 ? graded.reduce((sum, s) => sum + (s.average ?? 0), 0) / graded.length : null

  return (
    <>
      <h1 className="text-2xl">{t.dashboard.title}</h1>
      <p className="text-ink-muted">{t.dashboard.intro}</p>
      {classes?.length === 0 && <p className="text-ink-muted">{t.common.noClassTrainer}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {classes && <ClassPicker classes={classes} value={classId} onChange={setClassId} />}
        {students.length > 1 && (
          <SelectField label={t.dashboard.sort} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(t.dashboard.sorts) as Sort[]).map((key) => (
              <option key={key} value={key}>
                {t.dashboard.sorts[key]}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <ErrorText>{error}</ErrorText>

      {data && students.length === 0 && <p className="text-ink-muted">{t.dashboard.empty}</p>}
      {students.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-sm text-ink-muted">
          {PET_STAGES.map((stage) => (
            <span key={stage.id}>{t.dashboard.stageCount(t.pet.stages[stage.id] ?? stage.id, students.filter((s) => s.pet.stage === stage.id).length)}</span>
          ))}
          {classAverage !== null && <span>{t.dashboard.classAverage(classAverage)}</span>}
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {students.map((s) => (
          <StudentTile key={s.id} student={s} />
        ))}
      </ul>
    </>
  )
}

function StudentTile({ student: s }: { student: StudentCard }) {
  const idle = idleDays(s)
  const inactive = idle === null || idle > 7
  return (
    <li className="px-box tile flex gap-2 bg-surface p-1.5" style={{ ['--tile' as string]: inactive ? 'var(--color-warning)' : STAGE_COLOR[s.pet.stage] }}>
      <DragonSprite stage={s.pet.stage} scale={3} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div>
          <p className="truncate font-semibold">{s.display_name}</p>
          <p className="truncate text-sm text-ink-muted">
            {s.pet.name} · {t.pet.stages[s.pet.stage] ?? s.pet.stage}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <LevelBadge level={s.pet.level} />
          <StreakBadge streak={s.pet.streak} />
        </div>
        <XpBar current={s.pet.xp_in_level} needed={s.pet.xp_needed} />
        <p className="text-sm">
          {s.average === null ? <span className="text-ink-muted">{t.dashboard.noAverage}</span> : t.grades.averageValue(s.average)}
        </p>
        <p className={`text-sm ${inactive ? 'text-warning' : 'text-ink-muted'}`}>
          {inactive ? t.dashboard.inactive(idle) : t.dashboard.quizzesWeek(s.quizzes_last_7_days)}
        </p>
        {s.recovery_plans.map((p) => (
          <span key={p.subject} className="px-box px-flat self-start px-1 text-xs font-semibold text-xp [--frame:var(--color-xp)]">
            {t.dashboard.recovery(p.subject)}
            {p.target !== null && ` · ${t.dashboard.recoveryGoal(p.target)}`}
            {p.days !== null && ` · ${t.dashboard.recoveryDays(p.days)}`}
          </span>
        ))}
      </div>
    </li>
  )
}
