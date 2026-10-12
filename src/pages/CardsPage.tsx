import { useState } from 'react'
import { ButtonLink } from '../components/Button'
import { CardList } from '../components/CardList'
import { EmptyState } from '../components/EmptyState'
import { SelectField } from '../components/Field'
import type { CardType } from '../domain/types'
import { useCourseMap } from '../hooks/useLookups'
import { t } from '../i18n'
import { useCardsStore, useSubjectsStore } from '../stores'

export function CardsPage() {
  const cards = useCardsStore((s) => s.cards)
  const subjects = useSubjectsStore((s) => s.subjects)
  const courses = useCourseMap()
  const [subjectId, setSubjectId] = useState('')
  const [type, setType] = useState<CardType | ''>('')

  const visible = cards.filter(
    (c) => (!type || c.type === type) && (!subjectId || courses.get(c.courseId)?.subjectId === subjectId),
  )

  return (
    <>
      <h1 className="text-2xl">{t.cards.title}</h1>
      {cards.length === 0 ? (
        <EmptyState title={t.cards.emptyTitle}>
          <p className="text-ink-muted">{t.cards.emptyText}</p>
          <ButtonLink to="/" variant="primary">
            {t.nav.courses}
          </ButtonLink>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-1 sm:grid-cols-2">
            <SelectField label={t.common.subject} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">{t.common.allSubjects}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <SelectField label={t.cards.type} value={type} onChange={(e) => setType(e.target.value as CardType | '')}>
              <option value="">{t.cards.filterType}</option>
              {(['flashcard', 'cloze', 'quiz'] as const).map((ty) => (
                <option key={ty} value={ty}>
                  {t.cards.types[ty]}
                </option>
              ))}
            </SelectField>
          </div>
          <CardList cards={visible} showCourse />
        </>
      )}
    </>
  )
}
