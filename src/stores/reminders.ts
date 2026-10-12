import { create } from 'zustand'
import { defaultReminderSettings, type ReminderSettings } from '../domain/reminders'
import { getStorage } from '../storage'

type RemindersState = {
  settings: ReminderSettings
  load(): Promise<void>
  update(patch: Partial<Omit<ReminderSettings, 'id'>>): Promise<void>
}

export const useRemindersStore = create<RemindersState>()((set) => ({
  settings: defaultReminderSettings(),
  async load() {
    const stored = await getStorage().settings.get('reminders')
    if (stored) set({ settings: stored })
  },
  async update(patch) {
    // Relu depuis le stockage : le service worker a pu noter un envoi entre-temps.
    const current = (await getStorage().settings.get('reminders')) ?? defaultReminderSettings()
    const settings = { ...current, ...patch }
    await getStorage().settings.put(settings)
    set({ settings })
  },
}))
