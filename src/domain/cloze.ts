export type ClozeSegment =
  | { kind: 'text'; value: string }
  | { kind: 'gap'; index: number; answers: string[] }

const GAP_PATTERN = /\{\{([^{}]*)\}\}/g

/**
 * Découpe un texte à trous. Syntaxe : `{{réponse}}`, avec variantes
 * acceptées séparées par `|` : `{{1789|mil sept cent quatre-vingt-neuf}}`.
 */
export function parseCloze(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(GAP_PATTERN)) {
    const start = match.index
    if (start > last) segments.push({ kind: 'text', value: text.slice(last, start) })
    const answers = match[1]
      .split('|')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
    segments.push({ kind: 'gap', index: index++, answers })
    last = start + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) })
  return segments
}

export function clozeGaps(text: string): Extract<ClozeSegment, { kind: 'gap' }>[] {
  return parseCloze(text).filter((s): s is Extract<ClozeSegment, { kind: 'gap' }> => s.kind === 'gap')
}

/** Réponse principale de chaque trou, pour l'affichage du verso. */
export function clozeAnswerSummary(text: string): string {
  return clozeGaps(text)
    .map((g) => g.answers[0] ?? '')
    .join(' · ')
}

export function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

/** Insensible à la casse et aux espaces superflus, sensible aux accents. */
export function isGapAnswerCorrect(answers: readonly string[], input: string): boolean {
  const given = normalizeAnswer(input)
  return given.length > 0 && answers.some((a) => normalizeAnswer(a) === given)
}
