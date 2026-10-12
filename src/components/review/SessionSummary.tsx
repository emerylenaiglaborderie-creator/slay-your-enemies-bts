import { stageForLevel } from '../../domain/pet-stages'
import type { ReviewResult } from '../../domain/types'
import type { SessionReward } from '../../domain/xp'
import { t } from '../../i18n'
import { Button, ButtonLink } from '../Button'
import { DragonSprite } from '../DragonSprite'
import { LevelBadge, XpBar } from '../PetStats'

type Props = { results: readonly ReviewResult[]; reward: SessionReward | null; onExit(): void }

export function SessionSummary({ results, reward, onExit }: Props) {
  const again = results.filter((r) => r === 'again').length
  const pet = reward?.pet
  return (
    <div className="flex flex-col items-center gap-2 px-box px-box-lg px-3 py-5 text-center">
      <div className="relative">
        <DragonSprite mood="celebrate" scale={6} />
        {reward && reward.gained > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 left-1/2 animate-[xp-pop_1.2s_ease-out_both] text-2xl font-bold whitespace-nowrap text-xp tabular-nums"
          >
            {t.pet.gained(reward.gained)}
          </span>
        )}
      </div>
      <h2 className="text-xl">{t.review.finishedTitle}</h2>
      {pet && reward.stageChanged && <p className="font-pixel text-lg text-xp">{t.pet.stageUp(pet.name, stageForLevel(pet.level).id)}</p>}
      {pet && !reward.stageChanged && reward.levelsGained > 0 && <p className="font-pixel text-lg text-xp">{t.pet.levelUp(pet.level)}</p>}
      <p>{t.review.finishedText(results.length)}</p>
      {again > 0 && (
        <p className="text-ink-muted">
          {t.review.again} : {again}
        </p>
      )}
      {reward && (
        <p className="text-sm text-ink-muted" role="status">
          {t.pet.gained(reward.gained)}
          {reward.recovery > 0 && ` · ${t.pet.recoveryBonus(reward.recovery)}`}
          {reward.multiplier > 1 && ` · ${t.pet.multiplier(reward.multiplier)}`}
          {reward.capped && ` · ${t.pet.capped}`}
        </p>
      )}
      {pet && (
        <div className="flex w-full max-w-xs flex-col gap-1">
          <div className="flex justify-center">
            <LevelBadge level={pet.level} />
          </div>
          <XpBar xp={pet.xp} />
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-1">
        <Button variant="primary" autoFocus onClick={onExit}>
          {t.common.back}
        </Button>
        <ButtonLink to="/dragon">{t.pet.title}</ButtonLink>
      </div>
    </div>
  )
}
