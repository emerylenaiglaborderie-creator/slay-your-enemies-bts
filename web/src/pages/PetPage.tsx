import { useState } from 'react'
import { api, type MyPet, type PetView } from '../api/client'
import { errorMessage, useApi } from '../api/useApi'
import { Button } from '../components/Button'
import { DragonSprite } from '../components/DragonSprite'
import { ErrorText } from '../components/Feedback'
import { inputClass } from '../components/Field'
import { Panel } from '../components/Panel'
import { LevelBadge, StreakBadge, XpBar } from '../components/PetStats'
import { t } from '../i18n'
import { RecoveryPlanCard } from './GradesPage'

export function PetPage() {
  const { data, error: loadError, reload } = useApi<MyPet>('/me/pet')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  if (!data) return <ErrorText>{loadError}</ErrorText>
  const { pet, rules } = data

  async function rename(name: string) {
    try {
      await api<PetView>('PATCH', '/me/pet', { name })
      setEditingName(null)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <h1 className="text-2xl">{t.pet.title}</h1>
      <Panel className="flex flex-col items-center gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
        <DragonSprite stage={pet.stage} scale={6} />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-1.5">
          {editingName === null ? (
            <div className="flex flex-wrap items-center gap-1">
              <h2 className="text-2xl">{pet.name}</h2>
              <Button variant="ghost" onClick={() => setEditingName(pet.name)}>
                {t.pet.rename}
              </Button>
            </div>
          ) : (
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                void rename(editingName)
              }}
            >
              <input
                autoFocus
                aria-label={t.pet.nameLabel}
                className={inputClass}
                value={editingName}
                maxLength={24}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setEditingName(null)}
              />
              <Button type="submit" variant="primary">
                {t.common.save}
              </Button>
            </form>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap items-center gap-1">
            <LevelBadge level={pet.level} />
            <span className="font-pixel text-accent-soft">{t.pet.stages[pet.stage] ?? pet.stage}</span>
            <StreakBadge streak={pet.streak} />
          </div>
          <XpBar current={pet.xp_in_level} needed={pet.xp_needed} />
          <p className="text-sm text-ink-muted">
            {pet.next_stage ? t.pet.nextStage(t.pet.stages[pet.next_stage.id] ?? pet.next_stage.id, pet.next_stage.min_level) : t.pet.finalStage}
          </p>
          <p className="text-sm text-ink-muted tabular-nums">
            {t.pet.today(pet.earned_today, pet.daily_cap)} · {t.pet.totalXp(pet.xp)}
          </p>
        </div>
      </Panel>

      {data.recovery_plans.map((plan) => (
        <RecoveryPlanCard key={plan.subject} plan={plan} perAnswer={rules.recovery_bonus_per_answer} max={rules.recovery_bonus_max} />
      ))}

      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.pet.historyTitle}</h2>
        {data.recent_events.length === 0 ? (
          <p className="text-ink-muted">{t.pet.noHistory}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {data.recent_events.map((e) => (
              <li key={e.created_at + e.reason} className="flex justify-between gap-1">
                <span>
                  {t.pet.reasons[e.reason] ?? e.reason}{' '}
                  <span className="text-sm text-ink-muted">{new Date(e.created_at).toLocaleDateString('fr-FR')}</span>
                </span>
                <span className="font-pixel text-xp">{t.pet.gained(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.pet.howTitle}</h2>
        <ul className="flex list-[square] flex-col gap-0.5 pl-3 text-ink-muted">
          <li>{t.pet.howQuiz(rules.quiz_base)}</li>
          <li>{t.pet.howMastery(rules.mastery_bonus)}</li>
          <li>{t.pet.howStreak(rules.streak_max_bonus_pct)}</li>
          <li>{t.pet.howCap(rules.daily_cap)}</li>
          <li>{t.pet.howChallenge(rules.challenge_win_bonus)}</li>
          <li>{t.pet.howGrade(rules.good_grade_bonus, rules.good_grade_threshold)}</li>
          <li>{t.pet.howGentle}</li>
        </ul>
      </Panel>
    </>
  )
}
