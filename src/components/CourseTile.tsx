import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Course, Subject } from '../domain/types'
import { t } from '../i18n'
import { PixelIcon } from './PixelIcon'
import { PixelProgress } from './PixelProgress'

type Props = { course: Course; subject: Subject | undefined; cardCount: number; dueCount: number }

export function CourseTile({ course, subject, cardCount, dueCount }: Props) {
  const color = subject?.color ?? 'var(--color-accent-soft)'
  const upToDate = cardCount - dueCount
  return (
    <Link to={`/cours/${course.id}`} className="px-box px-box-lg course-tile flex h-full flex-col gap-1 p-1.5" style={{ '--subject': color } as CSSProperties}>
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0" style={{ color }}>
          <PixelIcon name="courses" scale={3} highlight="var(--color-ink)" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="line-clamp-2 font-semibold break-words">{course.title}</span>
          <span className="text-sm text-ink-muted">
            {t.courses.cardCount(cardCount)}
            {dueCount > 0 && <span className="text-accent-soft"> · {t.courses.dueCount(dueCount)}</span>}
          </span>
        </div>
      </div>
      {cardCount > 0 && (
        <div className="mt-auto flex items-center gap-1">
          <PixelProgress value={upToDate} max={cardCount} color={color} label={t.courses.upToDate(upToDate, cardCount)} />
          <span className="text-xs text-ink-muted tabular-nums">{t.courses.upToDate(upToDate, cardCount)}</span>
        </div>
      )}
    </Link>
  )
}
