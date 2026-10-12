import type { Subject } from '../domain/types'
import { t } from '../i18n'

export function SubjectBadge({ subject }: { subject: Subject | undefined }) {
  return (
    <span className="inline-flex w-fit items-center gap-0.5 px-box px-flat px-1 text-sm font-semibold">
      <span aria-hidden className="inline-block size-1 shrink-0" style={{ background: subject?.color ?? 'var(--color-ink-muted)' }} />
      {subject?.name ?? t.common.noSubject}
    </span>
  )
}
