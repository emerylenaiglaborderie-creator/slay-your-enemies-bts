import { useState, type FormEvent } from 'react'
import { api, type ClassSummary, type Evaluation, type EvaluationType } from '../api/client'
import { errorMessage, useApi } from '../api/useApi'
import { Button } from '../components/Button'
import { ErrorText } from '../components/Feedback'
import { SelectField, TextField } from '../components/Field'
import { Panel } from '../components/Panel'
import { IconButton, Tile } from '../components/Tile'
import type { PixelIconName } from '../assets/pixel/icons'
import { daysUntil, formatDay, t, todayIso } from '../i18n'
import { useAuthStore } from '../stores/auth'

const TYPES: EvaluationType[] = ['controle', 'examen', 'projet']
const TYPE_ICON: Record<EvaluationType, PixelIconName> = { controle: 'shield', examen: 'crown', projet: 'hammer' }
const TYPE_COLOR: Record<EvaluationType, string> = { controle: 'var(--color-accent-soft)', examen: 'var(--color-xp)', projet: 'var(--color-success)' }

export function EvaluationsPage() {
  const isTrainer = useAuthStore((s) => s.user)!.role === 'trainer'
  const { data: evaluations, error: loadError, reload } = useApi<Evaluation[]>('/evaluations')
  const { data: classes } = useApi<ClassSummary[]>('/classes')
  const [error, setError] = useState<string>()

  const upcoming = evaluations?.filter((e) => daysUntil(e.date) >= 0) ?? []
  const past = (evaluations?.filter((e) => daysUntil(e.date) < 0) ?? []).reverse()
  const showClass = (classes?.length ?? 0) > 1

  async function remove(id: string) {
    if (!window.confirm(t.evaluations.deleteConfirm)) return
    try {
      await api('DELETE', `/evaluations/${id}`)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <h1 className="text-2xl">{t.evaluations.title}</h1>
      {isTrainer && classes && (classes.length === 0 ? <p className="text-ink-muted">{t.common.noClassTrainer}</p> : <EvaluationForm classes={classes} onCreated={reload} />)}
      {!isTrainer && classes?.length === 0 && <p className="text-ink-muted">{t.common.noClassStudent}</p>}
      <ErrorText>{error ?? loadError}</ErrorText>

      <section className="flex flex-col gap-1">
        <h2 className="text-lg">{t.evaluations.upcoming}</h2>
        {upcoming.length === 0 ? (
          <p className="text-ink-muted">{t.evaluations.none}</p>
        ) : (
          <EvaluationList items={upcoming} showClass={showClass} onDelete={isTrainer ? remove : undefined} />
        )}
      </section>
      {past.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg">{t.evaluations.past}</h2>
          <EvaluationList items={past} showClass={showClass} onDelete={isTrainer ? remove : undefined} />
        </section>
      )}
    </>
  )
}

function EvaluationList({ items, showClass, onDelete }: { items: Evaluation[]; showClass: boolean; onDelete?: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((e) => {
        const days = daysUntil(e.date)
        const soon = days >= 0 && days <= 7
        return (
          <Tile
            key={e.id}
            icon={TYPE_ICON[e.type]}
            accent={days < 0 ? 'var(--color-ink-muted)' : TYPE_COLOR[e.type]}
            title={`${t.evaluations.types[e.type]} · ${e.title}`}
            subtitle={[formatDay(e.date), e.theme, showClass && e.class_name].filter(Boolean).join(' · ')}
            aside={
              <>
                <span className={`font-pixel ${soon ? 'text-xp' : 'text-ink-muted'}`}>{t.evaluations.countdown(days)}</span>
                {onDelete && <IconButton icon="trash" label={t.common.delete} danger onClick={() => onDelete(e.id)} />}
              </>
            }
          />
        )
      })}
    </ul>
  )
}

function EvaluationForm({ classes, onCreated }: { classes: ClassSummary[]; onCreated: () => void }) {
  const [classId, setClassId] = useState(classes[0].id)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<EvaluationType>('controle')
  const [theme, setTheme] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    try {
      await api('POST', `/classes/${classId}/evaluations`, { title, type, theme, date })
      setTitle('')
      setTheme('')
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <h2 className="text-lg">{t.evaluations.create}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {classes.length > 1 && (
            <SelectField label={t.common.class} value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField label={t.evaluations.type} value={type} onChange={(e) => setType(e.target.value as EvaluationType)}>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {t.evaluations.types[value]}
              </option>
            ))}
          </SelectField>
          <TextField label={t.evaluations.titleLabel} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField label={t.evaluations.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <TextField label={t.evaluations.theme} hint={t.evaluations.themeHint} value={theme} onChange={(e) => setTheme(e.target.value)} />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" className="self-start">
          {t.common.add}
        </Button>
      </form>
    </Panel>
  )
}
