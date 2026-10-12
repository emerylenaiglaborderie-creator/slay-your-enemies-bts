import { useState, type FormEvent } from 'react'
import type { Subject } from '../domain/types'
import { t } from '../i18n'
import { SUBJECT_COLORS, useSubjectsStore } from '../stores'
import { Button } from './Button'
import { inputClass } from './Field'

export function SubjectCreator({ onCreated }: { onCreated?(subject: Subject): void }) {
  const addSubject = useSubjectsStore((s) => s.addSubject)
  const count = useSubjectsStore((s) => s.subjects.length)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const chosen = color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const subject = await addSubject(name, chosen)
    setName('')
    setColor(null)
    onCreated?.(subject)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input aria-label={t.subjects.name} placeholder={t.subjects.name} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim()}>
          {t.common.add}
        </Button>
      </div>
      <div role="radiogroup" aria-label={t.subjects.color} className="flex flex-wrap gap-0.5">
        {SUBJECT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === chosen}
            aria-label={c}
            onClick={() => setColor(c)}
            className={`px-box size-3 ${c === chosen ? '[--frame:var(--color-ink)]' : '[--frame:transparent] px-flat'}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </form>
  )
}
