import { describe, expect, it } from 'vitest'
import { nextStage, stageForLevel, type PetStage } from './pet-stages'

describe('stades du dragon', () => {
  it('déduit le stade du niveau', () => {
    expect(stageForLevel(1).id).toBe('egg')
    expect(stageForLevel(4).id).toBe('egg')
    expect(stageForLevel(5).id).toBe('baby')
    expect(stageForLevel(14).id).toBe('baby')
    expect(stageForLevel(15).id).toBe('young')
    expect(stageForLevel(99).id).toBe('young')
  })

  it('indique le prochain stade, et rien au stade final', () => {
    expect(nextStage(3)?.minLevel).toBe(5)
    expect(nextStage(20)).toBeUndefined()
  })

  it('accepte un nouveau stade par simple ajout dans la config', () => {
    const stages: PetStage[] = [
      { id: 'egg', minLevel: 1, sprite: 'a.png' },
      { id: 'adult', minLevel: 30, sprite: 'b.png' },
    ]
    expect(stageForLevel(30, stages).id).toBe('adult')
  })
})
