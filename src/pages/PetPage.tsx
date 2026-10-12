import { useState } from 'react'
import { Button } from '../components/Button'
import { DragonSprite } from '../components/DragonSprite'
import { inputClass } from '../components/Field'
import { Panel } from '../components/Panel'
import { LevelBadge, StreakBadge, XpBar } from '../components/PetStats'
import { nextStage, stageForLevel } from '../domain/pet-stages'
import { XP_RULES, currentStreak, remainingXpToday } from '../domain/xp'
import { useNow } from '../hooks/useNow'
import { t } from '../i18n'
import { usePetStore } from '../stores'

export function PetPage() {
  const pet = usePetStore((s) => s.pet)
  const rename = usePetStore((s) => s.rename)
  const now = useNow()
  const [editingName, setEditingName] = useState<string | null>(null)
  const stage = stageForLevel(pet.level)
  const next = nextStage(pet.level)
  const streak = currentStreak(pet, now)
  const earnedToday = XP_RULES.dailyCap - remainingXpToday(pet, now)

  return (
    <>
      <h1 className="text-2xl">{t.pet.title}</h1>
      <Panel className="flex flex-col items-center gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
        <DragonSprite scale={6} />
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
                void rename(editingName).then(() => setEditingName(null))
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
          <div className="flex flex-wrap items-center gap-1">
            <LevelBadge level={pet.level} />
            <span className="font-pixel text-accent-soft">{t.pet.stages[stage.id] ?? stage.id}</span>
            <StreakBadge streak={streak} />
          </div>
          <XpBar xp={pet.xp} />
          <p className="text-sm text-ink-muted">
            {next ? t.pet.nextStage(t.pet.stages[next.id] ?? next.id, next.minLevel) : t.pet.finalStage}
          </p>
          <p className="text-sm text-ink-muted tabular-nums">
            {t.pet.today(earnedToday, XP_RULES.dailyCap)} · {t.pet.totalXp(pet.xp)}
          </p>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-1">
        <h2 className="text-lg">{t.pet.howTitle}</h2>
        <ul className="flex list-[square] flex-col gap-0.5 pl-3 text-ink-muted">
          <li>{t.pet.howBase(XP_RULES.sessionBase)}</li>
          <li>{t.pet.howMastery(XP_RULES.masteryBonus)}</li>
          <li>{t.pet.howStreak(Math.round(XP_RULES.streakMaxBonus * 100))}</li>
          <li>{t.pet.howCap(XP_RULES.dailyCap)}</li>
          <li>{t.pet.howGentle}</li>
        </ul>
      </Panel>
    </>
  )
}
