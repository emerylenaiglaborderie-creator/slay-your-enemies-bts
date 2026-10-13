/**
 * Stades d'évolution du dragon. Pour ajouter un stade : une entrée ici et
 * le sprite correspondant dans `src/assets/pixel/`. Triés par niveau croissant.
 */
export type PetStage = {
  id: string
  /** Niveau à partir duquel le stade est atteint. */
  minLevel: number
  /** Nom du fichier dans `src/assets/pixel/`. */
  sprite: string
  /**
   * Zone dessinée du sprite, en cases de la grille 32x32 (marge d'une case comprise) :
   * le cadre du dragon épouse le dessin au lieu de tout le carré transparent.
   * Absente : tout le carré.
   */
  bounds?: { x: number; y: number; w: number; h: number }
}

/** Taille de la grille des sprites, en cases. */
export const SPRITE_GRID = 32

export const PET_STAGES: readonly PetStage[] = [
  { id: 'egg', minLevel: 1, sprite: 'dragon-egg.png', bounds: { x: 9, y: 7, w: 15, h: 18 } },
  { id: 'baby', minLevel: 5, sprite: 'dragon-baby.png', bounds: { x: 9, y: 5, w: 15, h: 21 } },
  { id: 'young', minLevel: 15, sprite: 'dragon-young.png', bounds: { x: 6, y: 0, w: 25, h: 27 } },
]

/** Index du stade atteint à ce niveau. */
export function stageIndexForLevel(level: number, stages: readonly PetStage[] = PET_STAGES): number {
  let index = 0
  stages.forEach((stage, i) => {
    if (level >= stage.minLevel) index = i
  })
  return index
}

export function stageForLevel(level: number, stages: readonly PetStage[] = PET_STAGES): PetStage {
  return stages[stageIndexForLevel(level, stages)]
}

/** Prochain stade à atteindre, ou undefined au stade final. */
export function nextStage(level: number, stages: readonly PetStage[] = PET_STAGES): PetStage | undefined {
  return stages[stageIndexForLevel(level, stages) + 1]
}
