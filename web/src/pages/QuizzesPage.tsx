import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Difficulty, type Quiz, type QuizDraft } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { SelectField, TextField } from '../components/Field'
import { Panel } from '../components/Panel'
import { PixelIcon } from '../components/PixelIcon'
import { DifficultySkulls, IconButton, StatusChip, Tile } from '../components/Tile'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: 'var(--color-success)',
  medium: 'var(--color-xp)',
  hard: 'var(--color-danger)',
}

const emptyDraft: QuizDraft = { title: '', theme: '', difficulty: 'easy', seconds_per_question: 30, is_published: false }

export function QuizzesPage() {
  const user = useAuthStore((s) => s.user)!
  const isTrainer = user.role === 'trainer'
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<QuizDraft>(emptyDraft)
  const navigate = useNavigate()

  useEffect(() => {
    api<Quiz[]>('GET', '/quizzes')
      .then(setQuizzes)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    try {
      const quiz = await api<Quiz>('POST', '/quizzes', draft)
      navigate(`/quiz/${quiz.id}/modifier`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(quiz: Quiz) {
    if (!window.confirm(t.quizzes.deleteConfirm(quiz.title))) return
    try {
      await api('DELETE', `/quizzes/${quiz.id}`)
      setQuizzes((list) => list.filter((q) => q.id !== quiz.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Le formateur voit ses quiz, l'élève les quiz publiés.
  const visible = isTrainer ? quizzes.filter((q) => q.author_id === user.id) : quizzes.filter((q) => q.is_published)

  return (
    <>
      <h1 className="text-2xl">{isTrainer ? t.quizzes.trainerTitle : t.quizzes.studentTitle}</h1>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {isTrainer && (
        <Panel>
          <form onSubmit={create} className="flex flex-col gap-2">
            <h2 className="text-lg">{t.quizzes.create}</h2>
            <TextField label={t.quizzes.titleLabel} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
            <TextField
              label={t.quizzes.theme}
              value={draft.theme}
              onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
              placeholder={t.quizzes.themePlaceholder}
              required
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectField
                label={t.quizzes.difficulty}
                value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}
              >
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <option key={d} value={d}>
                    {t.quizzes.difficulties[d]}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t.quizzes.seconds}
                type="number"
                min={5}
                max={600}
                value={draft.seconds_per_question}
                onChange={(e) => setDraft({ ...draft, seconds_per_question: Number(e.target.value) })}
                required
              />
            </div>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={draft.is_published} onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })} />
              {t.quizzes.publish}
            </label>
            <Button type="submit" variant="primary">
              {t.quizzes.create}
            </Button>
          </form>
        </Panel>
      )}

      {visible.length === 0 ? (
        <p className="text-ink-muted">{isTrainer ? t.quizzes.trainerEmpty : t.quizzes.studentEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((quiz) => (
            <Tile
              key={quiz.id}
              icon="scroll"
              accent={DIFFICULTY_COLOR[quiz.difficulty]}
              title={quiz.title}
              subtitle={
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  {quiz.theme} · <DifficultySkulls difficulty={quiz.difficulty} label={t.quizzes.difficultyLabel(t.quizzes.difficulties[quiz.difficulty])} /> ·{' '}
                  {t.quizzes.perQuestion(quiz.seconds_per_question)}
                </span>
              }
              aside={
                isTrainer ? (
                  <>
                    <StatusChip published={quiz.is_published} />
                    <IconButton icon="pencil" label={t.quizzes.edit} onClick={() => navigate(`/quiz/${quiz.id}/modifier`)} />
                    <IconButton icon="trash" label={t.quizzes.delete} danger onClick={() => void remove(quiz)} />
                  </>
                ) : (
                  <ButtonLink to={`/quiz/${quiz.id}`} variant="primary">
                    <PixelIcon name="play" scale={2} highlight="currentColor" />
                    {t.quizzes.play}
                  </ButtonLink>
                )
              }
            />
          ))}
        </ul>
      )}
    </>
  )
}
