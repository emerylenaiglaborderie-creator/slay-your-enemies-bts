import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, ButtonLink } from '../components/Button'
import { CardForm } from '../components/CardForm'
import { CardList } from '../components/CardList'
import { inputClass, SelectField } from '../components/Field'
import { MarkdownView } from '../components/MarkdownView'
import { Panel } from '../components/Panel'
import { SubjectBadge } from '../components/SubjectBadge'
import { useDueCards } from '../hooks/useDueCards'
import { useSubjectMap } from '../hooks/useLookups'
import { t } from '../i18n'
import { useCardsStore, useCoursesStore, useSubjectsStore } from '../stores'

export function CoursePage() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const course = useCoursesStore((s) => s.courses.find((c) => c.id === courseId))
  const { updateCourse, removeCourse } = useCoursesStore()
  const allCards = useCardsStore((s) => s.cards)
  const addCard = useCardsStore((s) => s.addCard)
  const subjects = useSubjectsStore((s) => s.subjects)
  const subjectMap = useSubjectMap()
  const due = useDueCards({ courseId })
  const [editingTitle, setEditingTitle] = useState<string | null>(null)

  if (!course) {
    return (
      <>
        <p>{t.courses.notFound}</p>
        <ButtonLink to="/" className="self-start">
          {t.common.back}
        </ButtonLink>
      </>
    )
  }

  const cards = allCards.filter((c) => c.courseId === course.id)

  async function saveTitle() {
    if (course && editingTitle?.trim()) await updateCourse({ ...course, title: editingTitle.trim() })
    setEditingTitle(null)
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <SubjectBadge subject={subjectMap.get(course.subjectId)} />
        {editingTitle === null ? (
          <div className="flex flex-wrap items-center gap-1">
            <h1 className="text-2xl">{course.title}</h1>
            <Button variant="ghost" onClick={() => setEditingTitle(course.title)}>
              {t.courses.editTitle}
            </Button>
          </div>
        ) : (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              void saveTitle()
            }}
          >
            <input
              autoFocus
              aria-label={t.courses.titleLabel}
              className={inputClass}
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditingTitle(null)}
            />
            <Button type="submit" variant="primary">
              {t.common.save}
            </Button>
            <Button onClick={() => setEditingTitle(null)}>{t.common.cancel}</Button>
          </form>
        )}
        <div className="flex flex-wrap items-end gap-1">
          {due.length > 0 && (
            <ButtonLink to={`/reviser?cours=${course.id}`} variant="primary">
              {t.review.dueToday(due.length)}
            </ButtonLink>
          )}
          <div className="min-w-[200px]">
            <SelectField label={t.common.subject} value={course.subjectId} onChange={(e) => void updateCourse({ ...course, subjectId: e.target.value })}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm(t.courses.deleteConfirm)) return
              await removeCourse(course.id)
              navigate('/')
            }}
          >
            {t.common.delete}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <h2 className="sr-only">{t.courses.content}</h2>
          <MarkdownView source={course.markdown} />
        </Panel>
        {/* Colonne collante avec son propre défilement : le formulaire et la liste ne se chevauchent pas. */}
        <aside className="flex flex-col gap-2 lg:sticky lg:top-2 lg:max-h-[calc(100dvh-32px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:p-1">
          <Panel>
            <h2 className="mb-1 text-lg">{t.cards.new}</h2>
            <CardForm courseId={course.id} submitLabel={t.common.add} onSubmit={async (draft) => void (await addCard(draft))} />
          </Panel>
          <section className="flex flex-col gap-1">
            <h2 className="text-lg">
              {t.cards.title} ({cards.length})
            </h2>
            {cards.length === 0 ? <p className="text-ink-muted">{t.cards.emptyCourse}</p> : <CardList cards={cards} />}
          </section>
        </aside>
      </div>
    </>
  )
}
