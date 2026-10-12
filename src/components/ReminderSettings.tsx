import { useEffect, useState } from 'react'
import { backgroundRemindersAvailable, notificationsSupported, requestPermission, sendTestReminder, setBackgroundReminders } from '../reminders/browser'
import { t } from '../i18n'
import { useRemindersStore } from '../stores'
import { Button } from './Button'
import { Panel } from './Panel'
import { TextField } from './Field'

export function ReminderSettings() {
  const settings = useRemindersStore((s) => s.settings)
  const update = useRemindersStore((s) => s.update)
  const supported = notificationsSupported()
  const [permission, setPermission] = useState<NotificationPermission>(() => (supported ? Notification.permission : 'denied'))
  const [background, setBackground] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function refreshBackground() {
    setBackground(await backgroundRemindersAvailable())
  }

  // État du navigateur (service worker, permission), lu une fois à l'ouverture.
  useEffect(() => {
    if (supported) void backgroundRemindersAvailable().then(setBackground)
  }, [supported])

  async function toggle(enabled: boolean) {
    setMessage(null)
    if (enabled) {
      const result = await requestPermission()
      setPermission(result)
      if (result !== 'granted') return
    }
    await update({ enabled })
    await setBackgroundReminders(enabled)
    await refreshBackground()
  }

  async function test() {
    const result = await requestPermission()
    setPermission(result)
    if (result !== 'granted') return
    const due = await sendTestReminder()
    setMessage(due === 0 ? t.reminders.testNothing : null)
  }

  return (
    <Panel className="flex flex-col gap-1.5">
      <h2 className="text-lg">{t.reminders.title}</h2>
      {!supported ? (
        <p className="text-ink-muted">{t.reminders.unsupported}</p>
      ) : (
        <>
          <label className="flex items-center gap-1 font-semibold">
            <input
              type="checkbox"
              checked={settings.enabled && permission === 'granted'}
              disabled={permission === 'denied'}
              onChange={(e) => void toggle(e.target.checked)}
              className="size-2 accent-[var(--color-accent)]"
            />
            {t.reminders.enable}
          </label>
          {permission === 'denied' && (
            <p role="alert" className="text-sm text-danger">
              {t.reminders.denied}
            </p>
          )}
          <div className="max-w-[200px]">
            <TextField type="time" label={t.reminders.time} value={settings.time} onChange={(e) => e.target.value && void update({ time: e.target.value })} />
          </div>
          <ul className="flex list-[square] flex-col gap-0.5 pl-3 text-sm text-ink-muted">
            <li>{t.reminders.howItWorks}</li>
            <li>{t.reminders.whileOpen}</li>
            <li>{background ? t.reminders.backgroundOn : t.reminders.backgroundOff}</li>
          </ul>
          <Button className="self-start" disabled={permission === 'denied'} onClick={() => void test()}>
            {t.reminders.test}
          </Button>
          {message && (
            <p role="status" className="text-sm text-accent-soft">
              {message}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}
