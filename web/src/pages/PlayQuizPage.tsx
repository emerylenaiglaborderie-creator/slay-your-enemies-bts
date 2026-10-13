import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  api,
  type AnswerFeedback,
  type Attempt,
  type FinishedAttempt,
  type LeaderboardEntry,
  type MyPet,
  type Question,
  type QuizDetail,
} from '../api/client'
import { errorMessage, useApi } from '../api/useApi'
import { Button, ButtonLink } from '../components/Button'
import { DragonSprite } from '../components/DragonSprite'
import { ErrorText } from '../components/Feedback'
import { TextAreaField } from '../components/Field'
import { Panel } from '../components/Panel'
import { LevelBadge, XpBar } from '../components/PetStats'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

type Phase = 'intro' | 'question' | 'feedback' | 'finished'
type Given = { answerId?: string; freeText?: string; timedOut: boolean }

export function PlayQuizPage() {
  const { quizId } = useParams()
  const { data: quiz, error: loadError } = useApi<QuizDetail>(`/quizzes/${quizId}`)
  const [phase, setPhase] = useState<Phase>('intro')
  const [attempt, setAttempt] = useState<Attempt>()
  const [index, setIndex] = useState(0)
  const [given, setGiven] = useState<Given>()
  const [feedback, setFeedback] = useState<AnswerFeedback>()
  const [result, setResult] = useState<FinishedAttempt>()
  const [error, setError] = useState<string>()

  async function start() {
    setError(undefined)
    try {
      setAttempt(await api<Attempt>('POST', '/attempts', { quiz_id: quizId }))
      setIndex(0)
      setPhase('question')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const submit = useCallback(
    async (answer: Given, elapsedMs: number) => {
      if (!attempt || !quiz) return
      setGiven(answer)
      try {
        const fb = await api<AnswerFeedback>('POST', `/attempts/${attempt.id}/answers`, {
          question_id: quiz.questions[index].id,
          answer_id: answer.answerId,
          free_text: answer.freeText,
          time_ms: Math.round(elapsedMs),
        })
        setFeedback(fb)
        setPhase('feedback')
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [attempt, quiz, index],
  )

  async function next() {
    if (!attempt || !quiz) return
    setFeedback(undefined)
    setGiven(undefined)
    if (index + 1 < quiz.questions.length) {
      setIndex(index + 1)
      setPhase('question')
      return
    }
    try {
      setResult(await api<FinishedAttempt>('POST', `/attempts/${attempt.id}/finish`))
      setPhase('finished')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!quiz) return <ErrorText>{loadError}</ErrorText>
  const question = quiz.questions[index]
  const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0)

  return (
    <>
      <ButtonLink to="/" variant="ghost" className="self-start">
        {t.play.back}
      </ButtonLink>
      <h1 className="text-2xl">{quiz.title}</h1>
      <ErrorText>{error}</ErrorText>

      {phase === 'intro' && (
        <Panel className="flex flex-col gap-2">
          {quiz.description && <p>{quiz.description}</p>}
          <p className="text-ink-muted">
            {quiz.theme} · {t.quizzes.difficulties[quiz.difficulty]} · {t.quizzes.questionCount(quiz.questions.length)}
          </p>
          {quiz.questions.length === 0 ? (
            <p>{t.play.noQuestions}</p>
          ) : (
            <>
              <p>{t.play.rules(quiz.seconds_per_question)}</p>
              <Button variant="primary" className="self-start" onClick={() => void start()}>
                {t.play.start}
              </Button>
            </>
          )}
        </Panel>
      )}

      {(phase === 'question' || phase === 'feedback') && question && (
        <QuestionView
          key={question.id}
          question={question}
          position={index + 1}
          total={quiz.questions.length}
          seconds={quiz.seconds_per_question}
          phase={phase}
          given={given}
          feedback={feedback}
          onSubmit={submit}
          onNext={() => void next()}
        />
      )}

      {phase === 'finished' && result && <ResultView quiz={quiz} result={result} maxScore={maxScore} onReplay={() => void start()} />}
    </>
  )
}

function QuestionView({
  question,
  position,
  total,
  seconds,
  phase,
  given,
  feedback,
  onSubmit,
  onNext,
}: {
  question: Question
  position: number
  total: number
  seconds: number
  phase: 'question' | 'feedback'
  given?: Given
  feedback?: AnswerFeedback
  onSubmit: (answer: Given, elapsedMs: number) => Promise<void>
  onNext: () => void
}) {
  const limitMs = seconds * 1000
  // Instant d'affichage de la question, fixé une fois.
  const [startedAt] = useState(() => performance.now())
  const sent = useRef(false)
  const [remaining, setRemaining] = useState(limitMs)
  const [freeText, setFreeText] = useState('')

  const send = useCallback(
    (answer: Omit<Given, 'timedOut'>, timedOut = false) => {
      if (sent.current) return
      sent.current = true
      void onSubmit({ ...answer, timedOut }, performance.now() - startedAt)
    },
    [onSubmit, startedAt],
  )

  // Compte à rebours : à zéro, la question part sans réponse.
  useEffect(() => {
    if (phase !== 'question') return
    const id = window.setInterval(() => {
      const left = limitMs - (performance.now() - startedAt)
      setRemaining(Math.max(0, left))
      if (left <= 0) send({}, true)
    }, 200)
    return () => window.clearInterval(id)
  }, [phase, limitMs, send, startedAt])

  // Raccourcis clavier : 1 à 9 pour répondre, Entrée pour continuer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement) return
      if (phase === 'question' && question.type !== 'free_text') {
        const answer = question.answers[Number(e.key) - 1]
        if (answer) send({ answerId: answer.id })
      } else if (phase === 'feedback' && e.key === 'Enter') {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, question, send, onNext])

  const secondsLeft = Math.ceil(remaining / 1000)
  const urgent = remaining <= limitMs * 0.25

  function answerClass(id: string): string {
    if (phase !== 'feedback') return ''
    if (id === feedback?.correct_answer_id) return 'bg-success-tint [--frame:var(--color-success)]'
    if (id === given?.answerId) return 'bg-danger-tint [--frame:var(--color-danger)]'
    return 'opacity-60'
  }

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1 text-sm text-ink-muted">
        <span>{t.play.progress(position, total)}</span>
        <span>{t.play.points(question.points)}</span>
      </div>
      {phase === 'question' && (
        <div className="flex items-center gap-1">
          <div
            role="progressbar"
            aria-label={t.play.timeLeft}
            aria-valuemin={0}
            aria-valuemax={seconds}
            aria-valuenow={secondsLeft}
            className="px-box px-flat h-1.5 flex-1 overflow-hidden bg-surface-2 [--frame:var(--color-outline)]"
          >
            <div className={`h-full ${urgent ? 'bg-danger' : 'bg-xp'}`} style={{ width: `${(remaining / limitMs) * 100}%` }} />
          </div>
          <span className={`w-5 text-right font-pixel tabular-nums ${urgent ? 'text-danger' : ''}`}>{t.play.seconds(secondsLeft)}</span>
        </div>
      )}

      <h2 className="text-xl">{question.statement}</h2>

      {question.type === 'free_text' ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            send({ freeText })
          }}
        >
          <TextAreaField
            label={t.play.freeTextLabel}
            value={phase === 'feedback' ? (given?.freeText ?? '') : freeText}
            onChange={(e) => setFreeText(e.target.value)}
            disabled={phase === 'feedback'}
            maxLength={2000}
            autoFocus
          />
          {phase === 'question' && (
            <Button type="submit" variant="primary" className="self-start" disabled={!freeText.trim()}>
              {t.play.validate}
            </Button>
          )}
        </form>
      ) : (
        <ul className={`grid gap-1 ${question.answers.length > 2 ? 'sm:grid-cols-2' : 'grid-cols-2'}`}>
          {question.answers.map((answer, i) => (
            <li key={answer.id}>
              <Button
                className={`w-full justify-start text-left ${answerClass(answer.id)}`}
                disabled={phase === 'feedback'}
                onClick={() => send({ answerId: answer.id })}
              >
                <span className="font-pixel text-ink-muted">{i + 1}</span> {answer.label}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {phase === 'question' && (
        <div className="flex flex-wrap items-center justify-between gap-1">
          <p className="hidden text-xs text-ink-muted sm:block">{t.play.keyboardHint}</p>
          <Button variant="ghost" onClick={() => send({})}>
            {t.play.skip}
          </Button>
        </div>
      )}

      {phase === 'feedback' && feedback && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <p
            className={`font-pixel text-lg ${feedback.is_correct === true ? 'text-success' : feedback.is_correct === false ? 'text-danger' : 'text-accent-soft'}`}
          >
            {feedback.is_correct === null ? t.play.pending : feedback.is_correct ? t.play.correct : given?.timedOut || feedback.timed_out ? t.play.timedOut : t.play.wrong}
          </p>
          {feedback.explanation && <p className="text-ink-muted">{feedback.explanation}</p>}
          <Button variant="primary" className="self-start" onClick={onNext} autoFocus>
            {position < total ? t.play.next : t.play.finish}
          </Button>
        </div>
      )}
    </Panel>
  )
}

function ResultView({ quiz, result, maxScore, onReplay }: { quiz: QuizDetail; result: FinishedAttempt; maxScore: number; onReplay: () => void }) {
  const userId = useAuthStore((s) => s.user)?.id
  const { data: leaderboard } = useApi<LeaderboardEntry[]>(`/quizzes/${quiz.id}/leaderboard`)
  const { data: pet } = useApi<MyPet>(result.reward ? '/me/pet' : null)
  const reward = result.reward
  const hasFreeText = quiz.questions.some((q) => q.type === 'free_text')
  const celebrate = !!reward && (reward.levels_gained > 0 || reward.stage_changed)

  return (
    <>
      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.play.resultTitle}</h2>
        <p className="font-pixel text-3xl tabular-nums">{t.play.score(result.score ?? 0, maxScore)}</p>
        <p className="text-sm text-ink-muted">{t.play.totalTime(result.total_time_ms ?? 0)}</p>
        {hasFreeText && <p className="text-sm text-ink-muted">{t.play.pendingNote}</p>}
      </Panel>

      {reward && (
        <Panel className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
          {pet && <DragonSprite stage={pet.pet.stage} mood={celebrate ? 'celebrate' : 'idle'} scale={3} />}
          <div className="flex w-full flex-1 flex-col gap-1">
            <p className="font-pixel text-xl text-xp">{t.play.rewardTitle(reward.gained)}</p>
            {pet && reward.stage_changed && <p className="font-pixel text-accent-soft">{t.play.stageUp(pet.pet.name, pet.pet.stage)}</p>}
            {pet && reward.levels_gained > 0 && <p className="font-pixel">{t.play.levelUp(pet.pet.level)}</p>}
            <ul className="flex flex-wrap gap-x-2 text-sm text-ink-muted">
              <li>{t.play.rewardBase(reward.base)}</li>
              {reward.mastered > 0 && <li>{t.play.rewardMastery(reward.mastered)}</li>}
              {reward.recovery > 0 && <li>{t.play.rewardRecovery(reward.recovery)}</li>}
              {reward.multiplier > 1 && <li>{t.play.rewardStreak(reward.multiplier)}</li>}
            </ul>
            {reward.capped && <p className="text-sm text-warning">{t.play.rewardCapped}</p>}
            {pet && (
              <div className="flex items-center gap-1">
                <LevelBadge level={pet.pet.level} />
                <div className="flex-1">
                  <XpBar current={pet.pet.xp_in_level} needed={pet.pet.xp_needed} />
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.play.leaderboard}</h2>
        {leaderboard?.length === 0 && <p className="text-ink-muted">{t.play.leaderboardEmpty}</p>}
        <ol className="flex flex-col gap-0.5">
          {leaderboard?.slice(0, 10).map((entry, i) => (
            <li key={entry.user_id} className={`flex justify-between gap-1 ${entry.user_id === userId ? 'font-semibold text-accent-soft' : ''}`}>
              <span>
                <span className="font-pixel">{i + 1}.</span> {entry.display_name} {entry.user_id === userId && t.play.you}
              </span>
              <span className="tabular-nums">
                {t.play.score(entry.score, maxScore)} · {t.play.totalTime(entry.total_time_ms)}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="flex gap-1">
        <Button variant="primary" onClick={onReplay}>
          {t.play.replay}
        </Button>
        <ButtonLink to="/">{t.play.back}</ButtonLink>
      </div>
    </>
  )
}
