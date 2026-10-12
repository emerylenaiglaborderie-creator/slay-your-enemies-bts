import { createDexieStorage } from './dexie'
import type { AppStorage } from './types'

export type { AppStorage, Collection } from './types'

let current: AppStorage | null = null

export function getStorage(): AppStorage {
  current ??= createDexieStorage()
  return current
}

/** Pour les tests : remplace l'implémentation. */
export function setStorage(storage: AppStorage): void {
  current = storage
}
