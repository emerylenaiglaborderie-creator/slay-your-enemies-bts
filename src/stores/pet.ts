import { create } from 'zustand'
import { applyGradeBonus, applySession, createPet, type PetState, type SessionAnswer, type SessionReward } from '../domain/xp'
import { t } from '../i18n'
import { getStorage } from '../storage'

type PetStore = {
  pet: PetState
  load(): Promise<void>
  rename(name: string): Promise<void>
  /** Attribue l'XP d'une session terminée ou interrompue. */
  rewardSession(answers: readonly SessionAnswer[], recoverySubjectIds?: readonly string[], now?: number): Promise<SessionReward>
  /** Bonus ponctuel (bonne note), hors plafond quotidien. */
  awardBonus(amount: number): Promise<{ gained: number; levelsGained: number; stageChanged: boolean }>
}

export const usePetStore = create<PetStore>()((set, get) => ({
  pet: createPet(t.pet.defaultName),
  async load() {
    const [stored] = await getStorage().pets.list()
    if (stored) set({ pet: { ...createPet(t.pet.defaultName), ...stored } })
    else await getStorage().pets.put(get().pet)
  },
  async rename(name) {
    const pet = { ...get().pet, name: name.trim() || get().pet.name }
    await getStorage().pets.put(pet)
    set({ pet })
  },
  async rewardSession(answers, recoverySubjectIds = [], now = Date.now()) {
    const reward = applySession(get().pet, answers, now, recoverySubjectIds)
    if (reward.pet !== get().pet) {
      await getStorage().pets.put(reward.pet)
      set({ pet: reward.pet })
    }
    return reward
  },
  async awardBonus(amount) {
    const { pet, ...result } = applyGradeBonus(get().pet, amount)
    if (pet !== get().pet) {
      await getStorage().pets.put(pet)
      set({ pet })
    }
    return result
  },
}))
