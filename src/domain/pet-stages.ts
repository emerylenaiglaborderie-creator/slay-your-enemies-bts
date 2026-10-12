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
}

export const PET_STAGES: readonly PetStage[] = [
  { id: 'egg', minLevel: 1, sprite: 'dragon-egg.png' },
  { id: 'baby', minLevel: 5, sprite: 'dragon-baby.png' },
  { id: 'young', minLevel: 15, sprite: 'dragon-young.png' },
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
