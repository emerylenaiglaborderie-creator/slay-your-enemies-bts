import { useState } from 'react'
import { Button } from '../components/Button'
import { DeadlineCard } from '../components/DeadlineCard'
import { DeadlineForm } from '../components/DeadlineForm'
import { EmptyState } from '../components/EmptyState'
import { Panel } from '../components/Panel'
import { pastDeadlines, upcomingDeadlines } from '../domain/deadlines'
import { useNow } from '../hooks/useNow'
import { t } from '../i18n'
import { useDeadlinesStore } from '../stores'

export function DeadlinesPage() {
  const now = useNow()
  const deadlines = useDeadlinesStore((s) => s.deadlines)
  const addDeadline = useDeadlinesStore((s) => s.addDeadline)
  const [creating, setCreating] = useState(false)
  const upcoming = upcomingDeadlines(deadlines, now)
  const past = pastDeadlines(deadlines, now)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">{t.deadlines.title}</h1>
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t.deadlines.new}
          </Button>
        )}
      </div>

      {creating && (
        <Panel>
          <h2 className="mb-1 text-lg">{t.deadlines.new}</h2>
          <DeadlineForm
            submitLabel={t.common.add}
            onSubmit={async (draft) => {
              await addDeadline(draft)
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        </Panel>
      )}

      {upcoming.length === 0 && !creating ? (
        <EmptyState title={t.deadlines.emptyTitle}>
          <p className="max-w-md text-ink-muted">{t.deadlines.emptyText}</p>
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t.deadlines.new}
          </Button>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((d) => (
            <li key={d.id}>
              <DeadlineCard deadline={d} editable />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="flex flex-col gap-1">
          <summary className="cursor-pointer font-semibold text-ink-muted">{t.deadlines.past(past.length)}</summary>
          <ul className="mt-1.5 flex flex-col gap-2">
            {past.map((d) => (
              <li key={d.id}>
                <DeadlineCard deadline={d} editable />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
