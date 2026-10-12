import { parseCloze } from '../domain/cloze'

/** Affiche un texte à trous, avec les réponses révélées ou masquées. */
export function ClozeText({ text, reveal }: { text: string; reveal: boolean }) {
  return (
    <span>
      {parseCloze(text).map((segment, i) =>
        segment.kind === 'text' ? (
          <span key={i}>{segment.value}</span>
        ) : reveal ? (
          <mark key={i} className="bg-accent-tint px-0.5 font-semibold text-ink">
            {segment.answers[0]}
          </mark>
        ) : (
          <span key={i} className="mx-0.5 inline-block min-w-8 border-b-2 border-accent-soft align-baseline" aria-label="trou">
            &nbsp;
          </span>
        ),
      )}
    </span>
  )
}
