import { useState } from 'react'
import { draftFromCard } from '../domain/cards'
import type { Card } from '../domain/types'
import { useDueDates } from '../hooks/useDueCards'
import { useCourseMap } from '../hooks/useLookups'
import { useNow } from '../hooks/useNow'
import { formatDate, t } from '../i18n'
import { useCardsStore } from '../stores'
import { Button } from './Button'
import { CardForm } from './CardForm'
import { ClozeText } from './ClozeText'

export function CardList({ cards, showCourse = false }: { cards: readonly Card[]; showCourse?: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const dueDates = useDueDates()
  const courses = useCourseMap()
  const { updateCard, removeCard } = useCardsStore()
  const now = useNow()

  return (
    <ul className="flex flex-col gap-1.5">
      {cards.map((card) => {
        const due = dueDates.get(card.id)
        return (
          <li key={card.id} className="px-box p-1.5">
            {editingId === card.id ? (
              <CardForm
                courseId={card.courseId}
                initial={draftFromCard(card)}
                onSubmit={async (draft) => {
                  await updateCard(card.id, draft)
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-start justify-between gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-ink-muted">
                    <span className="font-pixel text-ink">{t.cards.types[card.type]}</span>
                    {showCourse && <span>{courses.get(card.courseId)?.title}</span>}
                    <span>
                      {due === undefined ? t.cards.neverReviewed : due <= now ? t.cards.due : t.cards.nextDue(formatDate(due))}
                    </span>
                  </div>
                  <div className="-mt-0.5 -mr-1 flex shrink-0 text-sm">
                    <Button variant="ghost" className="px-1 py-0.5" onClick={() => setEditingId(card.id)}>
                      {t.common.edit}
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-1 py-0.5"
                      onClick={() => {
                        if (confirm(t.cards.deleteConfirm)) void removeCard(card.id)
                      }}
                    >
                      {t.common.delete}
                    </Button>
                  </div>
                </div>
                <p className="font-semibold break-words">{card.type === 'cloze' ? <ClozeText text={card.front} reveal /> : card.front}</p>
                {card.type !== 'cloze' && <p className="text-ink-muted break-words">{card.back}</p>}
                {card.type === 'quiz' && card.choices && <p className="text-sm text-ink-muted line-through decoration-danger">{card.choices.join(' · ')}</p>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
