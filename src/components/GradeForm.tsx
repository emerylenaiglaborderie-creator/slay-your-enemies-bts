import { useState, type FormEvent } from 'react'
import { toDateInput } from '../domain/dates'
import { validateGradeDraft, type GradeDraft } from '../domain/grades'
import { useNow } from '../hooks/useNow'
import { t } from '../i18n'
import { useSubjectsStore } from '../stores'
import { Button } from './Button'
import { SelectField, TextField } from './Field'

type Props = {
  initial?: GradeDraft
  submitLabel?: string
  onSubmit(draft: GradeDraft): Promise<void>
  onCancel?(): void
}

export function GradeForm({ initial, submitLabel = t.common.save, onSubmit, onCancel }: Props) {
  const now = useNow()
  const subjects = useSubjectsStore((s) => s.subjects)
  const empty = (subjectId: string): GradeDraft => ({ subjectId, value: '', max: '20', coef: '1', date: toDateInput(now) })
  const [draft, setDraft] = useState<GradeDraft>(() => initial ?? empty(subjects[0]?.id ?? ''))
  const [submitted, setSubmitted] = useState(false)
  const errors = validateGradeDraft(draft, now)
  const errorFor = (...keys: (typeof errors)[number][]) => {
    const key = submitted ? errors.find((e) => keys.includes(e)) : undefined
    return key ? t.grades.errors[key] : undefined
  }
  const update = (patch: Partial<GradeDraft>) => setDraft((d) => ({ ...d, ...patch }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (errors.length > 0) return
    if (!initial) {
      setDraft(empty(draft.subjectId))
      setSubmitted(false)
    }
    await onSubmit(draft)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1.5fr]">
        <div className="col-span-2 sm:col-span-1">
          <SelectField label={t.common.subject} value={draft.subjectId} onChange={(e) => update({ subjectId: e.target.value })} error={errorFor('subjectRequired')}>
            {subjects.length === 0 && <option value="">{t.subjects.empty}</option>}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField label={t.grades.value} inputMode="decimal" value={draft.value} onChange={(e) => update({ value: e.target.value })} error={errorFor('valueInvalid')} />
        <TextField label={t.grades.max} inputMode="decimal" value={draft.max} onChange={(e) => update({ max: e.target.value })} error={errorFor('maxInvalid')} />
        <TextField label={t.grades.coef} inputMode="decimal" value={draft.coef} onChange={(e) => update({ coef: e.target.value })} error={errorFor('coefInvalid')} />
        <TextField
          type="date"
          label={t.grades.date}
          value={draft.date}
          max={toDateInput(now)}
          onChange={(e) => update({ date: e.target.value })}
          error={errorFor('dateRequired', 'dateInFuture')}
        />
      </div>
      <div className="flex gap-1">
        <Button type="submit" variant="primary" disabled={subjects.length === 0}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>{t.common.cancel}</Button>}
      </div>
    </form>
  )
}
