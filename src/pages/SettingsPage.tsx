import { Button } from '../components/Button'
import { Panel } from '../components/Panel'
import { ReminderSettings } from '../components/ReminderSettings'
import { SubjectBadge } from '../components/SubjectBadge'
import { SubjectCreator } from '../components/SubjectCreator'
import { t } from '../i18n'
import { useCoursesStore, useDeadlinesStore, useGradesStore, useSubjectsStore } from '../stores'

export function SettingsPage() {
  const subjects = useSubjectsStore((s) => s.subjects)
  const removeSubject = useSubjectsStore((s) => s.removeSubject)
  const courses = useCoursesStore((s) => s.courses)
  const deadlines = useDeadlinesStore((s) => s.deadlines)
  const grades = useGradesStore((s) => s.grades)

  return (
    <>
      <h1 className="text-2xl">{t.settings.title}</h1>
      <ReminderSettings />
      <Panel className="flex flex-col gap-1.5">
        <h2 className="text-lg">{t.subjects.title}</h2>
        {subjects.length === 0 && <p className="text-ink-muted">{t.subjects.empty}</p>}
        <ul className="flex flex-col gap-1">
          {subjects.map((subject) => {
            const used = courses.some((c) => c.subjectId === subject.id) || deadlines.some((d) => d.subjectId === subject.id) || grades.some((g) => g.subjectId === subject.id)
            return (
              <li key={subject.id} className="flex items-center justify-between gap-1">
                <SubjectBadge subject={subject} />
                <Button
                  variant="ghost"
                  title={used ? t.subjects.inUse : undefined}
                  disabled={used}
                  onClick={() => void removeSubject(subject.id)}
                >
                  {t.common.delete}
                </Button>
              </li>
            )
          })}
        </ul>
        <SubjectCreator />
      </Panel>
    </>
  )
}
