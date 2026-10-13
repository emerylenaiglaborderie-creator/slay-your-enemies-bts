import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type PendingAnswer, type Question, type QuestionDraft, type QuestionType, type QuizDetail } from '../api/client'
import { errorMessage, useApi } from '../api/useApi'
import { Button, ButtonLink } from '../components/Button'
import { ErrorText } from '../components/Feedback'
import { SelectField, TextAreaField, TextField, inputClass } from '../components/Field'
import { Panel } from '../components/Panel'
import { PixelIcon } from '../components/PixelIcon'
import { IconButton, Tile } from '../components/Tile'
import type { PixelIconName } from '../assets/pixel/icons'
import { t } from '../i18n'

const TYPES: QuestionType[] = ['mcq', 'true_false', 'free_text']
const QUESTION_ICON: Record<QuestionType, PixelIconName> = { mcq: 'cards', true_false: 'check', free_text: 'pencil' }

type AnswerRow = { label: string; is_correct: boolean }

/** Brouillon vide, ou pré-rempli depuis une question existante. */
function draftFrom(question?: Question): QuestionDraft {
  if (!question) return { type: 'mcq', statement: '', explanation: '', points: 1, answers: emptyAnswers('mcq') }
  return {
    type: question.type,
    statement: question.statement,
    explanation: question.explanation ?? '',
    points: question.points,
    answers: question.answers.map((a) => ({ label: a.label, is_correct: !!a.is_correct })),
  }
}

function emptyAnswers(type: QuestionType): AnswerRow[] {
  if (type === 'true_false')
    return [
      { label: t.editor.trueLabel, is_correct: true },
      { label: t.editor.falseLabel, is_correct: false },
    ]
  if (type === 'free_text') return [{ label: '', is_correct: true }]
  return Array.from({ length: 4 }, (_, i) => ({ label: '', is_correct: i === 0 }))
}

/** Réponses envoyées à l'API : lignes vides retirées. */
function cleanAnswers(draft: QuestionDraft): AnswerRow[] {
  return draft.answers.filter((a) => a.label.trim()).map((a) => ({ label: a.label.trim(), is_correct: draft.type === 'free_text' || a.is_correct }))
}

export function QuizEditorPage() {
  const { quizId } = useParams()
  const { data: quiz, error: loadError, reload } = useApi<QuizDetail>(`/quizzes/${quizId}`)
  const navigate = useNavigate()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [error, setError] = useState<string>()

  if (!quiz) return <ErrorText>{loadError}</ErrorText>

  async function togglePublished() {
    if (!quiz) return
    setError(undefined)
    try {
      const { title, description, theme, difficulty, seconds_per_question, is_published } = quiz
      await api('PATCH', `/quizzes/${quiz.id}`, { title, description, theme, difficulty, seconds_per_question, is_published: !is_published })
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function removeQuiz() {
    if (!quiz || !window.confirm(t.quizzes.deleteConfirm(quiz.title))) return
    try {
      await api('DELETE', `/quizzes/${quiz.id}`)
      navigate('/')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t.editor.deleteConfirm)) return
    try {
      await api('DELETE', `/questions/${id}`)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const saved = () => {
    setEditing(null)
    reload()
  }

  return (
    <>
      <ButtonLink to="/" variant="ghost" className="self-start">
        {t.editor.back}
      </ButtonLink>
      <h1 className="text-2xl">{quiz.title}</h1>
      <Panel className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-ink-muted">
          {quiz.theme} · {t.quizzes.difficulties[quiz.difficulty]} · {t.quizzes.perQuestion(quiz.seconds_per_question)}
          <br />
          {quiz.is_published ? t.editor.publishedHint : t.editor.draftHint}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button variant={quiz.is_published ? 'secondary' : 'primary'} onClick={() => void togglePublished()}>
            {quiz.is_published ? t.editor.unpublish : t.editor.publish}
          </Button>
          <Button variant="danger" onClick={() => void removeQuiz()}>
            <PixelIcon name="trash" scale={2} highlight="currentColor" />
            {t.quizzes.delete}
          </Button>
        </div>
      </Panel>
      <ErrorText>{error}</ErrorText>

      <section className="flex flex-col gap-1">
        <h2 className="text-lg">
          {t.editor.questions} ({quiz.questions.length})
        </h2>
        {quiz.questions.length === 0 && <p className="text-ink-muted">{t.editor.noQuestions}</p>}
        <ol className="flex flex-col gap-1.5">
          {quiz.questions.map((q, i) =>
            editing === q.id ? (
              <li key={q.id}>
                <QuestionForm quizId={quiz.id} question={q} onSaved={saved} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <Tile
                key={q.id}
                icon={QUESTION_ICON[q.type]}
                title={
                  <>
                    <span className="font-pixel text-ink-muted">{i + 1}.</span> {q.statement}
                  </>
                }
                subtitle={`${t.editor.types[q.type]} · ${t.play.points(q.points)}`}
                aside={
                  <>
                    <IconButton icon="pencil" label={t.quizzes.edit} onClick={() => setEditing(q.id)} />
                    <IconButton icon="trash" label={t.common.delete} danger onClick={() => void remove(q.id)} />
                  </>
                }
              >
                {q.answers.length > 0 && (
                  <ul className="flex flex-wrap gap-1 text-sm">
                    {q.answers.map((a) => (
                      <li key={a.id} className={`px-box px-flat inline-flex items-center gap-0.5 px-1 ${a.is_correct ? 'bg-success-tint [--frame:var(--color-success)]' : 'text-ink-muted'}`}>
                        {a.is_correct && <PixelIcon name="check" scale={1} className="text-success" />}
                        {a.label}
                      </li>
                    ))}
                  </ul>
                )}
              </Tile>
            ),
          )}
        </ol>
        {editing === 'new' ? (
          <QuestionForm quizId={quiz.id} onSaved={saved} onCancel={() => setEditing(null)} />
        ) : (
          <Button variant="primary" className="self-start" onClick={() => setEditing('new')}>
            {t.editor.addQuestion}
          </Button>
        )}
      </section>

      {quiz.questions.some((q) => q.type === 'free_text') && <PendingAnswers quizId={quiz.id} />}
    </>
  )
}

function QuestionForm({ quizId, question, onSaved, onCancel }: { quizId: string; question?: Question; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<QuestionDraft>(() => draftFrom(question))
  const [error, setError] = useState<string>()

  const setAnswer = (i: number, patch: Partial<AnswerRow>) =>
    setDraft({ ...draft, answers: draft.answers.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  // Une seule bonne réponse pour Vrai / Faux ; plusieurs possibles en QCM.
  const markCorrect = (i: number, checked: boolean) =>
    setDraft({
      ...draft,
      answers: draft.answers.map((a, j) => (draft.type === 'true_false' ? { ...a, is_correct: j === i } : j === i ? { ...a, is_correct: checked } : a)),
    })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const body = { ...draft, explanation: draft.explanation?.trim() || undefined, answers: cleanAnswers(draft) }
    try {
      if (question) await api('PUT', `/questions/${question.id}`, { ...body, position: question.position })
      else await api('POST', `/quizzes/${quizId}/questions`, body)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <h3 className="text-lg">{question ? t.editor.editQuestion : t.editor.addQuestion}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectField
            label={t.editor.type}
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as QuestionType
              setDraft({ ...draft, type, answers: emptyAnswers(type) })
            }}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t.editor.types[type]}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t.editor.points}
            type="number"
            min={0}
            max={100}
            value={draft.points}
            onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
            required
          />
        </div>
        <TextAreaField label={t.editor.statement} value={draft.statement} onChange={(e) => setDraft({ ...draft, statement: e.target.value })} required />

        {draft.type === 'mcq' && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold">{t.editor.answers}</legend>
            <p className="text-sm text-ink-muted">{t.editor.mcqHint}</p>
            {draft.answers.map((a, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  aria-label={t.editor.answerLabel(i + 1)}
                  className={inputClass}
                  value={a.label}
                  onChange={(e) => setAnswer(i, { label: e.target.value })}
                />
                <label className="flex shrink-0 items-center gap-0.5 text-sm">
                  <input type="checkbox" checked={a.is_correct} onChange={(e) => markCorrect(i, e.target.checked)} />
                  {t.editor.correct}
                </label>
                {draft.answers.length > 2 && (
                  <Button variant="ghost" className="text-sm" onClick={() => setDraft({ ...draft, answers: draft.answers.filter((_, j) => j !== i) })}>
                    {t.editor.removeAnswer}
                  </Button>
                )}
              </div>
            ))}
            {draft.answers.length < 6 && (
              <Button variant="ghost" className="self-start text-sm" onClick={() => setDraft({ ...draft, answers: [...draft.answers, { label: '', is_correct: false }] })}>
                {t.editor.addAnswer}
              </Button>
            )}
          </fieldset>
        )}

        {draft.type === 'true_false' && (
          <fieldset className="flex flex-col gap-0.5">
            <legend className="text-sm font-semibold">{t.editor.correctIs}</legend>
            <div className="flex gap-2">
              {draft.answers.map((a, i) => (
                <label key={a.label} className="flex items-center gap-0.5">
                  <input type="radio" name="tf-correct" checked={a.is_correct} onChange={() => markCorrect(i, true)} />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {draft.type === 'free_text' && (
          <TextField
            label={t.editor.expected}
            hint={t.editor.expectedHint}
            value={draft.answers[0]?.label ?? ''}
            onChange={(e) => setDraft({ ...draft, answers: [{ label: e.target.value, is_correct: true }] })}
          />
        )}

        <TextField
          label={t.editor.explanation}
          hint={t.editor.explanationHint}
          value={draft.explanation ?? ''}
          onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
        />
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-1">
          <Button type="submit" variant="primary">
            {t.common.save}
          </Button>
          <Button onClick={onCancel}>{t.common.cancel}</Button>
        </div>
      </form>
    </Panel>
  )
}

/** Correction manuelle des réponses en texte libre (F-007). */
function PendingAnswers({ quizId }: { quizId: string }) {
  const { data, reload } = useApi<PendingAnswer[]>(`/quizzes/${quizId}/pending-answers`)
  const [error, setError] = useState<string>()

  async function grade(id: string, isCorrect: boolean) {
    try {
      await api('PATCH', `/attempt-answers/${id}/grade`, { is_correct: isCorrect })
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-lg">
        {t.editor.pendingTitle} {data && data.length > 0 && `(${data.length})`}
      </h2>
      <ErrorText>{error}</ErrorText>
      {data?.length === 0 && <p className="text-ink-muted">{t.editor.pendingEmpty}</p>}
      <ul className="flex flex-col gap-1">
        {data?.map((p) => (
          <li key={p.attempt_answer_id} className="px-box flex flex-col gap-1 bg-surface p-2">
            <p className="text-sm text-ink-muted">
              {p.display_name} · {p.statement}
            </p>
            <p className="font-semibold">{p.free_text ?? t.editor.noAnswerGiven}</p>
            {p.expected && <p className="text-sm text-ink-muted">{t.editor.expectedShort(p.expected)}</p>}
            <div className="flex gap-1">
              <Button variant="primary" onClick={() => void grade(p.attempt_answer_id, true)}>
                {t.editor.markCorrect}
              </Button>
              <Button variant="danger" onClick={() => void grade(p.attempt_answer_id, false)}>
                {t.editor.markWrong}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
