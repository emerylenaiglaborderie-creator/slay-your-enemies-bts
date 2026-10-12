import MarkdownIt from 'markdown-it'
import { useMemo } from 'react'

// html: false pour ne jamais injecter de HTML brut venant d'un fichier importé.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

export function MarkdownView({ source }: { source: string }) {
  const html = useMemo(() => md.render(source), [source])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
