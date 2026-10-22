import { useMemo, useState } from 'react'
import { api, type ClassDetail, type CreatedGrade, type Evaluation, type EvaluationType, type Grade } from '../api/client'
import { errorMessage } from '../api/useApi'
import type { PixelIconName } from '../assets/pixel/icons'
import { daysUntil, formatDay, t, todayIso } from '../i18n'
import { Button } from './Button'
import { ErrorText, Notice } from './Feedback'
import { TextField, inputClass } from './Field'
import { Panel } from './Panel'
import { PixelIcon } from './PixelIcon'
import { IconButton } from './Tile'

const GOOD = 14
const BAD = 10
/** Durée d'un plan de rattrapage : par défaut et maximum, comme `xp::RECOVERY_DAYS` et `xp::RECOVERY_MAX_DAYS`. */
const RECOVERY_DAYS = 14
const RECOVERY_MAX_DAYS = 365
/** Plus grand objectif accepté par l'API (`i32`). */
const MAX_TARGET = 2 ** 31 - 1
const TYPE_ICON: Record<EvaluationType, PixelIconName> = { controle: 'shield', examen: 'crown', projet: 'hammer' }

type Column = {
  key: string
  title: string
  date: string
  max: number
  coef: number
  type?: EvaluationType
  evaluationId?: string
  subject?: string
  /** élève → note */
  grades: Map<string, Grade>
}

type Draft = {
  key: string
  title: string
  evaluationId?: string
  subject: string
  max: string
  coef: string
  date: string
  locked: boolean
  values: Record<string, string>
  /** élève → objectif de rattrapage saisi */
  targets: Record<string, string>
  /** durée des plans ouverts par cette saisie ; vide : `RECOVERY_DAYS` */
  days: string
}

/** Réglage du rattrapage d'une note déjà saisie. */
type GoalEdit = { grade: Grade; name: string; title: string; target: string; days: string }

const on20 = (g: Pick<Grade, 'value' | 'max'>) => (g.value / g.max) * 20

/** Accepte la virgule décimale française. */
function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Vrai si la note saisie ouvre un plan de rattrapage : seule une telle note accepte un objectif. */
function opensRecovery(value: string, max: string): boolean {
  const v = parseNumber(value)
  const m = parseNumber(max)
  return v !== null && m !== null && m > 0 && on20({ value: v, max: m }) < BAD
}

/** Entier de 1 à `max` saisi dans un champ : `undefined` si vide, `null` si invalide. */
function parseCount(raw: string, max: number): number | undefined | null {
  const s = raw.trim()
  if (!s) return undefined
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null
}

/** Colonnes du carnet : évaluations passées (même sans note) et notes hors évaluation, par date. */
function buildColumns(grades: Grade[], evaluations: Evaluation[]): Column[] {
  const columns = new Map<string, Column>()
  for (const e of evaluations) {
    if (daysUntil(e.date) > 0) continue
    columns.set(`e:${e.id}`, { key: `e:${e.id}`, title: e.title, date: e.date, max: 20, coef: 1, type: e.type, evaluationId: e.id, grades: new Map() })
  }
  for (const g of grades) {
    const key = g.evaluation_id ? `e:${g.evaluation_id}` : `f:${g.subject}|${g.graded_on}|${g.max}|${g.coef}`
    let column = columns.get(key)
    if (!column) {
      const evaluation = evaluations.find((e) => e.id === g.evaluation_id)
      column = {
        key,
        title: g.evaluation_title ?? g.subject,
        date: evaluation?.date ?? g.graded_on,
        max: g.max,
        coef: g.coef,
        type: evaluation?.type,
        evaluationId: g.evaluation_id ?? undefined,
        subject: g.evaluation_id ? undefined : g.subject,
        grades: new Map(),
      }
      columns.set(key, column)
    }
    if (column.grades.size === 0) {
      column.max = g.max
      column.coef = g.coef
    }
    column.grades.set(g.student_id, g)
  }
  return [...columns.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'fr'))
}

function GradeChip({ grade }: { grade: Grade }) {
  const score = on20(grade)
  const tone = score >= GOOD ? 'bg-success-tint text-success [--frame:var(--color-success)]' : score < BAD ? 'bg-danger-tint text-danger [--frame:var(--color-danger)]' : 'bg-surface-2'
  return <span className={`px-box px-flat inline-block min-w-5 px-0.5 text-center font-bold tabular-nums ${tone}`}>{grade.value.toLocaleString('fr-FR')}</span>
}

export function GradeBook({ detail, grades, evaluations, onChanged }: { detail: ClassDetail; grades: Grade[]; evaluations: Evaluation[]; onChanged: () => void }) {
  const columns = useMemo(() => buildColumns(grades, evaluations), [grades, evaluations])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [goal, setGoal] = useState<GoalEdit | null>(null)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const studentAverage = (studentId: string) => {
    const own = grades.filter((g) => g.student_id === studentId)
    const coef = own.reduce((sum, g) => sum + g.coef, 0)
    return coef > 0 ? own.reduce((sum, g) => sum + on20(g) * g.coef, 0) / coef : null
  }
  const averages = detail.members.map((m) => studentAverage(m.id)).filter((a): a is number => a !== null)
  const classAverage = averages.length > 0 ? averages.reduce((a, b) => a + b, 0) / averages.length : null

  function startColumn(column: Column) {
    setNotice(undefined)
    setError(undefined)
    setGoal(null)
    setDraft({
      key: column.key,
      title: column.title,
      evaluationId: column.evaluationId,
      subject: column.subject ?? '',
      max: String(column.max),
      coef: String(column.coef),
      date: column.evaluationId ? (column.date <= todayIso() ? column.date : todayIso()) : column.date,
      locked: column.grades.size > 0,
      values: {},
      targets: {},
      days: '',
    })
  }

  function startFree() {
    setNotice(undefined)
    setError(undefined)
    setGoal(null)
    setDraft({ key: 'new', title: t.grades.newFree, subject: '', max: '20', coef: '1', date: todayIso(), locked: false, values: {}, targets: {}, days: '' })
  }

  async function save() {
    if (!draft) return
    setError(undefined)
    const days = parseCount(draft.days, RECOVERY_MAX_DAYS)
    if (days === null) {
      setError(t.grades.invalidDays(RECOVERY_MAX_DAYS))
      return
    }
    const entries: { student_id: string; value: number; recovery_target?: number; recovery_days?: number }[] = []
    for (const m of detail.members) {
      const value = parseNumber(draft.values[m.id] ?? '')
      if (value === null) continue
      if (!opensRecovery(draft.values[m.id] ?? '', draft.max)) {
        entries.push({ student_id: m.id, value })
        continue
      }
      const target = parseCount(draft.targets[m.id] ?? '', MAX_TARGET)
      if (target === null) {
        setError(t.grades.invalidTarget)
        return
      }
      entries.push({ student_id: m.id, value, recovery_target: target, recovery_days: days })
    }
    try {
      const created = await api<CreatedGrade[]>('POST', `/classes/${detail.id}/grades`, {
        evaluation_id: draft.evaluationId,
        subject: draft.evaluationId ? undefined : draft.subject,
        max: parseNumber(draft.max),
        coef: parseNumber(draft.coef),
        graded_on: draft.date,
        entries,
      })
      const bonus = created.filter((c) => c.outcome === 'bonus').length
      const recovery = created.filter((c) => c.outcome === 'recovery').length
      setNotice([t.grades.saved(created.length), t.grades.outcomes(bonus, recovery)].filter(Boolean).join(' '))
      setDraft(null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  function startGoal(grade: Grade, name: string, title: string) {
    setNotice(undefined)
    setError(undefined)
    setGoal({ grade, name, title, target: grade.recovery_target?.toString() ?? '', days: grade.recovery_days?.toString() ?? '' })
  }

  /** Objectif et durée vides : on retire les réglages (`DELETE`), sinon on les remplace (`PUT`). */
  async function saveGoal() {
    if (!goal) return
    setError(undefined)
    const target = parseCount(goal.target, MAX_TARGET)
    const days = parseCount(goal.days, RECOVERY_MAX_DAYS)
    if (target === null) return setError(t.grades.invalidTarget)
    if (days === null) return setError(t.grades.invalidDays(RECOVERY_MAX_DAYS))
    try {
      const path = `/grades/${goal.grade.id}/recovery-goal`
      if (target === undefined && days === undefined) await api('DELETE', path)
      else await api('PUT', path, { target, days })
      setNotice(t.grades.goalSaved(goal.name))
      setGoal(null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function removeGrade(grade: Grade) {
    if (!window.confirm(t.grades.deleteConfirm)) return
    try {
      await api('DELETE', `/grades/${grade.id}`)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (detail.members.length === 0) return <p className="text-ink-muted">{t.classes.noMembers}</p>

  const shown: Column[] = draft?.key === 'new'
    ? [...columns, { key: 'new', title: draft.subject || t.grades.newFree, date: draft.date, max: Number(draft.max) || 20, coef: Number(draft.coef) || 1, grades: new Map() }]
    : columns

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div>
          <h2 className="text-lg">{t.grades.book}</h2>
          <p className="text-sm text-ink-muted">{t.grades.bookHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="px-box px-flat bg-success-tint px-1 text-success [--frame:var(--color-success)]">{t.grades.legendGood(GOOD)}</span>
          <span className="px-box px-flat bg-danger-tint px-1 text-danger [--frame:var(--color-danger)]">{t.grades.legendBad(BAD)}</span>
          {!draft && (
            <Button variant="secondary" onClick={startFree}>
              <PixelIcon name="grades" scale={2} />
              {t.grades.newFree}
            </Button>
          )}
        </div>
      </div>

      {draft && (
        <Panel className="flex flex-col gap-2 [--frame:var(--color-accent-soft)]">
          <h3 className="font-pixel text-lg">{t.grades.editing(draft.key === 'new' ? draft.subject || t.grades.newFree : draft.title)}</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            {draft.key === 'new' && (
              <TextField label={t.grades.subject} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} required />
            )}
            <TextField label={t.grades.max} inputMode="decimal" value={draft.max} disabled={draft.locked} onChange={(e) => setDraft({ ...draft, max: e.target.value })} />
            <TextField label={t.grades.coef} inputMode="decimal" value={draft.coef} disabled={draft.locked} onChange={(e) => setDraft({ ...draft, coef: e.target.value })} />
            <TextField label={t.grades.date} type="date" max={todayIso()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <TextField
              label={t.grades.recoveryDays}
              hint={t.grades.recoveryDaysHint(RECOVERY_DAYS)}
              inputMode="numeric"
              placeholder={String(RECOVERY_DAYS)}
              value={draft.days}
              onChange={(e) => setDraft({ ...draft, days: e.target.value })}
            />
          </div>
          {draft.locked && <p className="text-sm text-ink-muted">{t.grades.lockedScale}</p>}
          <p className="text-sm text-ink-muted">{t.grades.emptyValueHint}</p>
          <p className="text-sm text-ink-muted">{t.grades.targetHint}</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-1">
            <Button variant="primary" onClick={() => void save()}>
              {t.grades.saveAll}
            </Button>
            <Button onClick={() => setDraft(null)}>{t.common.cancel}</Button>
          </div>
        </Panel>
      )}
      {goal && !draft && (
        <Panel className="flex flex-col gap-2 [--frame:var(--color-xp)]">
          <h3 className="font-pixel text-lg">{t.grades.goalTitle(goal.name, goal.title)}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField
              label={t.grades.goalTarget}
              inputMode="numeric"
              placeholder={t.grades.goalNone}
              value={goal.target}
              onChange={(e) => setGoal({ ...goal, target: e.target.value })}
            />
            <TextField
              label={t.grades.recoveryDays}
              inputMode="numeric"
              placeholder={String(RECOVERY_DAYS)}
              value={goal.days}
              onChange={(e) => setGoal({ ...goal, days: e.target.value })}
            />
          </div>
          <p className="text-sm text-ink-muted">{t.grades.goalHint(RECOVERY_DAYS)}</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-1">
            <Button variant="primary" onClick={() => void saveGoal()}>
              {t.grades.goalSave}
            </Button>
            <Button onClick={() => setGoal(null)}>{t.common.cancel}</Button>
          </div>
        </Panel>
      )}
      <Notice>{notice}</Notice>
      {!draft && !goal && <ErrorText>{error}</ErrorText>}

      {shown.length === 0 ? (
        <p className="text-ink-muted">{t.grades.noColumns}</p>
      ) : (
        <div className="px-box px-box-lg overflow-x-auto bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border align-bottom">
                <th className="sticky left-0 z-10 bg-surface p-1 text-left">{t.grades.student}</th>
                {shown.map((c) => {
                  const active = draft?.key === c.key
                  const missing = detail.members.filter((m) => !c.grades.has(m.id)).length
                  return (
                    <th key={c.key} className={`min-w-14 p-1 text-center font-normal ${active ? 'bg-accent-tint' : ''}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <PixelIcon name={c.type ? TYPE_ICON[c.type] : 'grades'} scale={2} className="text-accent-soft" highlight="var(--color-ink)" />
                        <span className="font-semibold">{c.title}</span>
                        <span className="text-xs text-ink-muted">
                          {formatDay(c.date)} · {t.grades.columnMeta(c.max, c.coef)}
                        </span>
                        {!draft && (
                          <span className="flex items-center gap-0.5">
                            {missing > 0 && <span className="text-xs text-xp">{t.grades.toFill}</span>}
                            <IconButton icon="pencil" label={t.grades.enterColumn(c.title)} onClick={() => startColumn(c)} />
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
                <th className="p-1 text-center">{t.grades.average}</th>
              </tr>
            </thead>
            <tbody>
              {detail.members.map((m) => {
                const average = studentAverage(m.id)
                return (
                  <tr key={m.id} className="border-b border-border">
                    <th scope="row" className="sticky left-0 z-10 bg-surface p-1 text-left font-semibold">
                      {m.display_name}
                    </th>
                    {shown.map((c) => {
                      const grade = c.grades.get(m.id)
                      const active = draft?.key === c.key
                      return (
                        <td key={c.key} className={`p-0.5 text-center ${active ? 'bg-accent-tint' : ''}`}>
                          {grade ? (
                            <span className="inline-flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-0.5">
                                <GradeChip grade={grade} />
                                {active && <IconButton icon="trash" label={t.grades.deleteGrade(m.display_name)} danger onClick={() => void removeGrade(grade)} />}
                                {!draft && on20(grade) < BAD && (
                                  <IconButton icon="settings" label={t.grades.goalEdit(m.display_name)} onClick={() => startGoal(grade, m.display_name, c.title)} />
                                )}
                              </span>
                              {(grade.recovery_target !== null || grade.recovery_days !== null) && (
                                <span className="text-xs text-xp">{t.grades.goalShort(grade.recovery_target, grade.recovery_days)}</span>
                              )}
                            </span>
                          ) : active && draft ? (
                            <div className="mx-auto flex w-8 flex-col gap-0.5">
                              <input
                                aria-label={`${m.display_name} : ${draft.title}`}
                                inputMode="decimal"
                                className={`${inputClass} text-center tabular-nums`}
                                value={draft.values[m.id] ?? ''}
                                onChange={(e) => setDraft({ ...draft, values: { ...draft.values, [m.id]: e.target.value } })}
                              />
                              <input
                                aria-label={t.grades.targetLabel(m.display_name)}
                                placeholder={t.grades.targetPlaceholder}
                                inputMode="numeric"
                                className={`${inputClass} text-center text-xs tabular-nums disabled:opacity-40`}
                                disabled={!opensRecovery(draft.values[m.id] ?? '', draft.max)}
                                value={draft.targets[m.id] ?? ''}
                                onChange={(e) => setDraft({ ...draft, targets: { ...draft.targets, [m.id]: e.target.value } })}
                              />
                            </div>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="p-1 text-center font-bold tabular-nums">{average === null ? '—' : average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="text-ink-muted">
                <th scope="row" className="sticky left-0 z-10 bg-surface p-1 text-left font-normal">
                  {t.grades.classAverage}
                </th>
                {shown.map((c) => {
                  const values = [...c.grades.values()].map((g) => g.value)
                  return (
                    <td key={c.key} className="p-1 text-center tabular-nums">
                      {values.length === 0 ? '—' : (values.reduce((a, b) => a + b, 0) / values.length).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                    </td>
                  )
                })}
                <td className="p-1 text-center font-bold tabular-nums text-ink">
                  {classAverage === null ? '—' : classAverage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
