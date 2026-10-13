import { useState, type FormEvent } from 'react'
import { api, type ClassDetail, type ClassSummary } from '../api/client'
import { errorMessage, useApi } from '../api/useApi'
import { Button } from '../components/Button'
import { ErrorText, Notice } from '../components/Feedback'
import { TextField } from '../components/Field'
import { Panel } from '../components/Panel'
import { IconButton, Tile } from '../components/Tile'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

export function ClassesPage() {
  const user = useAuthStore((s) => s.user)!
  const isTrainer = user.role === 'trainer'
  const { data: classes, error: loadError, reload } = useApi<ClassSummary[]>('/classes')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setNotice(undefined)
    try {
      if (isTrainer) {
        await api('POST', '/classes', { name: input })
      } else {
        const joined = await api<ClassSummary>('POST', '/classes/join', { code: input })
        setNotice(t.classes.joined(joined.name))
      }
      setInput('')
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(c: ClassSummary) {
    const message = isTrainer ? t.classes.deleteConfirm(c.name) : t.classes.leaveConfirm(c.name)
    if (!window.confirm(message)) return
    try {
      await api('DELETE', isTrainer ? `/classes/${c.id}` : `/classes/${c.id}/members/${user.id}`)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <h1 className="text-2xl">{t.classes.title}</h1>
      <Panel>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            {isTrainer ? (
              <TextField label={t.classes.create} placeholder={t.classes.namePlaceholder} value={input} onChange={(e) => setInput(e.target.value)} required maxLength={60} />
            ) : (
              <TextField
                label={t.classes.join}
                hint={t.classes.codeHint}
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                required
                maxLength={6}
                className="font-pixel tracking-widest uppercase"
              />
            )}
          </div>
          <Button type="submit" variant="primary">
            {isTrainer ? t.common.add : t.classes.joinButton}
          </Button>
        </form>
      </Panel>
      <ErrorText>{error ?? loadError}</ErrorText>
      <Notice>{notice}</Notice>

      {classes?.length === 0 && <p className="text-ink-muted">{isTrainer ? t.classes.emptyTrainer : t.classes.emptyStudent}</p>}
      <ul className="flex flex-col gap-1.5">
        {classes?.map((c) => (
          <ClassItem key={c.id} summary={c} isTrainer={isTrainer} onRemove={() => void remove(c)} onChanged={reload} />
        ))}
      </ul>
    </>
  )
}

function ClassItem({ summary, isTrainer, onRemove, onChanged }: { summary: ClassSummary; isTrainer: boolean; onRemove: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const { data: detail, reload } = useApi<ClassDetail>(open ? `/classes/${summary.id}` : null)

  async function removeMember(id: string, name: string) {
    if (!window.confirm(t.classes.removeConfirm(name))) return
    await api('DELETE', `/classes/${summary.id}/members/${id}`)
    reload()
    onChanged()
  }

  return (
    <Tile
      icon="people"
      title={summary.name}
      subtitle={isTrainer ? t.classes.members(summary.member_count) : `${t.classes.trainer(summary.trainer_name)} · ${t.classes.members(summary.member_count)}`}
      aside={
        <>
          {summary.join_code && (
            <span className="text-sm text-ink-muted">
              {t.classes.shareCode}{' '}
              <span className="px-box px-flat bg-surface-2 px-1 font-pixel text-lg tracking-widest text-ink [--frame:var(--color-accent-soft)]">{summary.join_code}</span>
            </span>
          )}
          {isTrainer && (
            <Button variant="ghost" className="text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? t.classes.hideMembers : t.classes.showMembers}
            </Button>
          )}
          <IconButton icon="trash" label={isTrainer ? t.common.delete : t.classes.leave} danger onClick={onRemove} />
        </>
      }
    >
      {open && detail && (
        detail.members.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.classes.noMembers}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {detail.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-1 border-t border-border pt-0.5">
                <span>{m.display_name}</span>
                <Button variant="ghost" className="text-sm" onClick={() => void removeMember(m.id, m.display_name)}>
                  {t.classes.remove}
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </Tile>
  )
}
