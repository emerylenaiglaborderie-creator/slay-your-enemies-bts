import { useState, type FormEvent } from 'react'
import { emptyDraft, validateCardDraft, type CardDraft } from '../domain/cards'
import type { CardType } from '../domain/types'
import { t } from '../i18n'
import { Button } from './Button'
import { ClozeText } from './ClozeText'
import { TextAreaField, TextField } from './Field'

const TYPES: CardType[] = ['flashcard', 'cloze', 'quiz']

type Props = {
  initial?: CardDraft
  courseId: string
  submitLabel?: string
  onSubmit(draft: CardDraft): Promise<void>
  onCancel?(): void
}

export function CardForm({ initial, courseId, submitLabel = t.common.save, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<CardDraft>(initial ?? emptyDraft(courseId))
  const [submitted, setSubmitted] = useState(false)
  const errors = validateCardDraft(draft)
  const visibleErrors = submitted ? errors : []
  const errorFor = (...keys: (typeof errors)[number][]) => {
    const key = visibleErrors.find((e) => keys.includes(e))
    return key ? t.cards.errors[key] : undefined
  }

  const update = (patch: Partial<CardDraft>) => setDraft((d) => ({ ...d, ...patch }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (errors.length > 0) return
    if (!initial) {
      // Vidé avant l'enregistrement pour ne pas effacer une saisie commencée entre-temps.
      setDraft(emptyDraft(courseId, draft.type))
      setSubmitted(false)
    }
    await onSubmit(draft)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <fieldset className="flex flex-wrap gap-1">
        <legend className="mb-0.5 text-sm font-semibold">{t.cards.type}</legend>
        {TYPES.map((type) => (
          <label
            key={type}
            className={`px-box cursor-pointer px-1.5 py-0.5 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus ${
              draft.type === type ? '[--frame:var(--color-accent-soft)] bg-accent-tint' : 'bg-surface'
            }`}
          >
            <input type="radio" name="card-type" value={type} checked={draft.type === type} onChange={() => update({ type })} className="sr-only" />
            {t.cards.types[type]}
          </label>
        ))}
      </fieldset>

      {draft.type === 'flashcard' && (
        <>
          <TextAreaField label={t.cards.front} value={draft.front} onChange={(e) => update({ front: e.target.value })} error={errorFor('frontRequired')} />
          <TextAreaField label={t.cards.back} value={draft.back} onChange={(e) => update({ back: e.target.value })} error={errorFor('backRequired')} />
        </>
      )}

      {draft.type === 'cloze' && (
        <>
          <TextAreaField
            label={t.cards.clozeText}
            hint={t.cards.clozeHint}
            value={draft.front}
            onChange={(e) => update({ front: e.target.value })}
            error={errorFor('frontRequired', 'clozeNoGap', 'clozeEmptyGap')}
          />
          {draft.front.includes('{{') && (
            <p className="bg-surface-2 px-1.5 py-1 text-sm">
              <span className="font-semibold">{t.cards.preview} : </span>
              <ClozeText text={draft.front} reveal={false} />
            </p>
          )}
        </>
      )}

      {draft.type === 'quiz' && (
        <>
          <TextAreaField label={t.cards.question} value={draft.front} onChange={(e) => update({ front: e.target.value })} error={errorFor('frontRequired')} />
          <TextField label={t.cards.correctAnswer} value={draft.back} onChange={(e) => update({ back: e.target.value })} error={errorFor('backRequired')} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-0.5 text-sm font-semibold">{t.cards.wrongAnswers}</legend>
            {draft.choices.map((choice, i) => (
              <div key={i} className="flex gap-1">
                <input
                  aria-label={`${t.cards.wrongAnswers} ${i + 1}`}
                  className="px-box px-flat w-full bg-surface px-1.5 py-1 focus:[--frame:var(--color-accent-soft)]"
                  value={choice}
                  onChange={(e) => update({ choices: draft.choices.map((c, j) => (j === i ? e.target.value : c)) })}
                />
                {draft.choices.length > 1 && (
                  <Button variant="ghost" onClick={() => update({ choices: draft.choices.filter((_, j) => j !== i) })}>
                    {t.cards.removeWrongAnswer}
                  </Button>
                )}
              </div>
            ))}
            {draft.choices.length < 5 && (
              <Button variant="ghost" className="self-start" onClick={() => update({ choices: [...draft.choices, ''] })}>
                + {t.cards.addWrongAnswer}
              </Button>
            )}
            {errorFor('quizNoChoice', 'quizDuplicateChoice') && (
              <p className="text-sm text-danger" role="alert">
                {errorFor('quizNoChoice', 'quizDuplicateChoice')}
              </p>
            )}
          </fieldset>
        </>
      )}

      <div className="flex gap-1">
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>{t.common.cancel}</Button>}
      </div>
    </form>
  )
}
