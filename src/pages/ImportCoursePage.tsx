import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { inputClass, SelectField } from '../components/Field'
import { MarkdownView } from '../components/MarkdownView'
import { Panel } from '../components/Panel'
import { SubjectCreator } from '../components/SubjectCreator'
import { splitMarkdownCourse, titleFromFilename, type CourseSection } from '../domain/markdown-import'
import { t } from '../i18n'
import { useCoursesStore, useSubjectsStore } from '../stores'

type Source = { filename: string; markdown: string }
type EditableSection = CourseSection & { include: boolean }

function sectionsFor(source: Source, split: boolean): EditableSection[] {
  const fallback = titleFromFilename(source.filename)
  const { title, sections } = splitMarkdownCourse(source.markdown, fallback)
  if (!split || sections.length <= 1) {
    return [{ title, markdown: source.markdown.trim(), include: true }]
  }
  return sections.map((s) => ({ ...s, include: true }))
}

export function ImportCoursePage() {
  const navigate = useNavigate()
  const subjects = useSubjectsStore((s) => s.subjects)
  const addCourses = useCoursesStore((s) => s.addCourses)
  const [source, setSource] = useState<Source | null>(null)
  const [split, setSplit] = useState(true)
  const [sections, setSections] = useState<EditableSection[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const effectiveSubjectId = subjectId || subjects[0]?.id || ''
  const selected = sections.filter((s) => s.include && s.title.trim())

  async function loadFile(file: File | undefined) {
    if (!file) return
    try {
      const next = { filename: file.name, markdown: await file.text() }
      setSource(next)
      setSections(sectionsFor(next, split))
      setPreviewIndex(null)
      setError(null)
    } catch {
      setError(t.importer.readError)
    }
  }

  function toggleSplit(value: boolean) {
    setSplit(value)
    if (source) setSections(sectionsFor(source, value))
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    void loadFile(event.dataTransfer.files[0])
  }

  async function handleImport() {
    if (!effectiveSubjectId) {
      setError(t.importer.needSubject)
      return
    }
    const created = await addCourses(
      selected.map((s) => ({ subjectId: effectiveSubjectId, title: s.title.trim(), markdown: s.markdown })),
    )
    navigate(created.length === 1 ? `/cours/${created[0].id}` : '/')
  }

  return (
    <>
      <h1 className="text-2xl">{t.importer.title}</h1>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex cursor-pointer flex-col items-center gap-0.5 px-box px-box-lg [--frame:var(--color-accent-soft)] px-2 py-3 text-center has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus"
      >
        <span className="font-semibold">{source ? source.filename : t.importer.pickFile}</span>
        <span className="text-sm text-ink-muted">{t.importer.dropHint}</span>
        <input type="file" accept=".md,.markdown,.txt,text/markdown" className="sr-only" onChange={(e) => void loadFile(e.target.files?.[0])} />
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {source && (
        <>
          <Panel className="flex flex-col gap-2">
            <h2 className="text-lg">{t.common.subject}</h2>
            {subjects.length > 0 && (
              <SelectField label={t.common.subject} value={effectiveSubjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{subjects.length > 0 ? t.importer.newSubject : t.subjects.create}</span>
              <SubjectCreator onCreated={(s) => setSubjectId(s.id)} />
            </div>
          </Panel>

          <Panel className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <h2 className="text-lg">{t.importer.sections(sections.length)}</h2>
              <label className="flex items-center gap-1 text-sm font-semibold">
                <input type="checkbox" checked={split} onChange={(e) => toggleSplit(e.target.checked)} className="size-2 accent-[var(--color-accent)]" />
                {t.importer.split}
              </label>
            </div>
            <ol className="flex flex-col gap-1.5">
              {sections.map((section, i) => (
                <li key={i} className="px-box px-flat flex flex-col gap-1 p-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      aria-label={t.importer.include}
                      checked={section.include}
                      onChange={(e) => setSections((all) => all.map((s, j) => (j === i ? { ...s, include: e.target.checked } : s)))}
                      className="size-2 shrink-0 accent-[var(--color-accent)]"
                    />
                    <input
                      aria-label={t.courses.titleLabel}
                      className={inputClass}
                      value={section.title}
                      onChange={(e) => setSections((all) => all.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))}
                    />
                    <Button variant="ghost" aria-expanded={previewIndex === i} onClick={() => setPreviewIndex(previewIndex === i ? null : i)}>
                      {t.importer.preview}
                    </Button>
                  </div>
                  {previewIndex === i && (
                    <div className="max-h-[400px] overflow-y-auto bg-bg p-1.5">
                      <MarkdownView source={section.markdown} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Panel>

          <Button variant="primary" className="self-start" disabled={selected.length === 0} onClick={() => void handleImport()}>
            {t.importer.submit(selected.length)}
          </Button>
        </>
      )}
    </>
  )
}
