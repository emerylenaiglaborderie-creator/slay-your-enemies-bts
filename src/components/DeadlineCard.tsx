import { useState } from 'react'
import { daysUntil } from '../domain/deadlines'
import { toDateInput } from '../domain/dates'
import type { Deadline } from '../domain/types'
import { useDueCards } from '../hooks/useDueCards'
import { useSubjectMap } from '../hooks/useLookups'
import { useNow } from '../hooks/useNow'
import { formatDate, t } from '../i18n'
import { useDeadlinesStore } from '../stores'
import { Button, ButtonLink } from './Button'
import { DeadlineForm } from './DeadlineForm'
import { SubjectBadge } from './SubjectBadge'

/** Seuil (en jours) à partir duquel le compte à rebours passe en couleur d'alerte. */
const URGENT_DAYS = 3

export function DeadlineCard({ deadline, editable = false }: { deadline: Deadline; editable?: boolean }) {
  const now = useNow()
  const subjects = useSubjectMap()
  const due = useDueCards({ deadlineId: deadline.id })
  const { updateDeadline, removeDeadline } = useDeadlinesStore()
  const [editing, setEditing] = useState(false)
  const days = daysUntil(deadline, now)
  const past = days < 0
  const urgent = !past && days <= URGENT_DAYS

  if (editing) {
    return (
      <div className="px-box px-box-lg p-2">
        <h3 className="mb-1 text-lg">{t.deadlines.editTitle}</h3>
        <DeadlineForm
          initial={{ subjectId: deadline.subjectId, type: deadline.type, date: toDateInput(deadline.date), courseIds: deadline.courseIds }}
          onSubmit={async (draft) => {
            await updateDeadline(deadline.id, draft)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <article
      className={`px-box px-box-lg flex gap-2 p-1.5 ${urgent ? '[--frame:var(--color-warning)]' : ''} ${past ? 'opacity-70' : ''}`}
      aria-label={`${t.deadlines.types[deadline.type]}, ${t.deadlines.countdown(days)}`}
    >
      <div
        className={`flex w-10 shrink-0 flex-col items-center justify-center bg-surface-2 py-1 ${urgent ? 'text-warning' : 'text-accent-soft'}`}
        aria-hidden
      >
        <span className="text-xl leading-none font-bold tabular-nums">{past ? '·' : t.deadlines.countdownShort(days)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-pixel font-semibold">{t.deadlines.types[deadline.type]}</span>
          <SubjectBadge subject={subjects.get(deadline.subjectId)} />
        </div>
        <p className="text-sm text-ink-muted">
          <span className={urgent ? 'font-semibold text-warning' : 'font-semibold text-ink'}>{t.deadlines.countdown(days)}</span>
          {' · '}
          {formatDate(deadline.date)} · {t.deadlines.courseCount(deadline.courseIds.length)}
        </p>
        {!past && deadline.courseIds.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {due.length > 0 ? (
              <ButtonLink to={`/reviser?echeance=${deadline.id}`} variant="primary" className="px-1.5 py-0.5 text-sm">
                {t.deadlines.reviewNow(due.length)}
              </ButtonLink>
            ) : (
              <span className="text-sm text-success">{t.deadlines.upToDate}</span>
            )}
          </div>
        )}
      </div>
      {editable && (
        <div className="-mt-0.5 -mr-1 flex shrink-0 flex-col items-end text-sm sm:flex-row sm:items-start">
          <Button variant="ghost" className="px-1 py-0.5" onClick={() => setEditing(true)}>
            {t.common.edit}
          </Button>
          <Button
            variant="ghost"
            className="px-1 py-0.5"
            onClick={() => {
              if (confirm(t.deadlines.deleteConfirm)) void removeDeadline(deadline.id)
            }}
          >
            {t.common.delete}
          </Button>
        </div>
      )}
    </article>
  )
}
