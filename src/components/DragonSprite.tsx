import { stageForLevel } from '../domain/pet-stages'
import { usePetStore } from '../stores'

export type DragonMood = 'idle' | 'celebrate'

const SPRITE_SIZE = 32

// Tous les sprites du dossier : un nouveau stade n'a besoin que de son fichier.
const SPRITES = import.meta.glob<string>('../assets/pixel/*.png', { eager: true, import: 'default' })

function spriteUrl(file: string): string | undefined {
  return SPRITES[`../assets/pixel/${file}`]
}

const animation: Record<DragonMood, string> = {
  idle: 'animate-[breathe_3s_ease-in-out_infinite]',
  celebrate: 'animate-[bounce-pixel_0.6s_steps(3)_3]',
}

/**
 * Sprite 32x32 du stade actuel, affiché en x4 par défaut. Posé sur `surface-2`
 * pour que le contour noir ne se fonde pas dans le fond de l'app.
 */
export function DragonSprite({ mood = 'idle', scale = 4 }: { mood?: DragonMood; scale?: number }) {
  const level = usePetStore((s) => s.pet.level)
  const size = SPRITE_SIZE * scale
  const src = spriteUrl(stageForLevel(level).sprite)
  return (
    <div className="px-box px-box-lg bg-surface-2 p-1">
      {src ? (
        <img src={src} alt="" width={size} height={size} draggable={false} className={`pixelated block ${animation[mood]}`} />
      ) : (
        <div style={{ width: size, height: size }} />
      )}
    </div>
  )
}
