import { PET_STAGES, SPRITE_GRID } from '../domain/pet-stages'

export type DragonMood = 'idle' | 'celebrate'

// Tous les sprites du dossier : un nouveau stade n'a besoin que de son fichier.
const SPRITES = import.meta.glob<string>('../assets/pixel/*.png', { eager: true, import: 'default' })

const animation: Record<DragonMood, string> = {
  idle: 'animate-[breathe_3s_ease-in-out_infinite]',
  celebrate: 'animate-[bounce-pixel_0.6s_steps(3)_3]',
}

/**
 * Dragon d'un stade, recadré sur sa zone dessinée. `scale` = pixels écran par case
 * de la grille 32x32 (4 par défaut). Posé sur `surface-2` pour que le contour noir
 * ne se fonde pas dans le fond de l'app.
 */
export function DragonSprite({ stage = 'egg', mood = 'idle', scale = 4 }: { stage?: string; mood?: DragonMood; scale?: number }) {
  const config = PET_STAGES.find((s) => s.id === stage) ?? PET_STAGES[0]
  const src = SPRITES[`../assets/pixel/${config.sprite}`]
  const box = config.bounds ?? { x: 0, y: 0, w: SPRITE_GRID, h: SPRITE_GRID }
  return (
    <div className="px-box px-box-lg shrink-0 self-start bg-surface-2 p-0.5">
      <div className="relative overflow-hidden" style={{ width: box.w * scale, height: box.h * scale }}>
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            className={`pixelated absolute max-w-none ${animation[mood]}`}
            style={{ left: -box.x * scale, top: -box.y * scale, width: SPRITE_GRID * scale, height: SPRITE_GRID * scale }}
          />
        )}
      </div>
    </div>
  )
}
