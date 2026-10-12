import { create } from 'zustand'
import { deadlineFieldsFromDraft, type DeadlineDraft } from '../domain/deadlines'
import type { Deadline } from '../domain/types'
import { getStorage } from '../storage'

type DeadlinesState = {
  deadlines: Deadline[]
  load(): Promise<void>
  addDeadline(draft: DeadlineDraft): Promise<Deadline>
  updateDeadline(id: string, draft: DeadlineDraft): Promise<void>
  removeDeadline(id: string): Promise<void>
}

export const useDeadlinesStore = create<DeadlinesState>()((set) => ({
  deadlines: [],
  async load() {
    set({ deadlines: await getStorage().deadlines.list() })
  },
  async addDeadline(draft) {
    const deadline: Deadline = { id: crypto.randomUUID(), ...deadlineFieldsFromDraft(draft) }
    await getStorage().deadlines.put(deadline)
    set((s) => ({ deadlines: [...s.deadlines, deadline] }))
    return deadline
  },
  async updateDeadline(id, draft) {
    const deadline: Deadline = { id, ...deadlineFieldsFromDraft(draft) }
    await getStorage().deadlines.put(deadline)
    set((s) => ({ deadlines: s.deadlines.map((d) => (d.id === id ? deadline : d)) }))
  },
  async removeDeadline(id) {
    await getStorage().deadlines.remove(id)
    set((s) => ({ deadlines: s.deadlines.filter((d) => d.id !== id) }))
  },
}))
