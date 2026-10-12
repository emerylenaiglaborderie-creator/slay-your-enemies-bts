export type CourseSection = {
  title: string
  markdown: string
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE = /^\s*(```|~~~)/

type Heading = { line: number; level: number; text: string }

function findHeadings(lines: readonly string[]): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (FENCE.test(line)) inFence = !inFence
    if (inFence) return
    const match = HEADING.exec(line)
    if (match) headings.push({ line: i, level: match[1].length, text: match[2].trim() })
  })
  return headings
}

/** Nom de fichier sans extension, avec espaces à la place des tirets. */
export function titleFromFilename(filename: string): string {
  return filename.replace(/\.(md|markdown|txt)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Cours'
}

/**
 * Découpe un cours Markdown en chapitres. Si le document a un unique titre
 * de niveau 1 suivi de sous-titres, ce titre sert de nom de cours et le
 * découpage se fait au niveau inférieur. Le texte qui précède le premier
 * chapitre devient une section "Introduction".
 */
export function splitMarkdownCourse(markdown: string, fallbackTitle: string): {
  title: string
  sections: CourseSection[]
} {
  const text = markdown.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const headings = findHeadings(lines)
  if (headings.length === 0) {
    return { title: fallbackTitle, sections: [{ title: fallbackTitle, markdown: text.trim() }] }
  }

  let title = fallbackTitle
  let titleLine = -1
  let candidates = headings
  const minLevel = Math.min(...headings.map((h) => h.level))
  const top = headings.filter((h) => h.level === minLevel)
  if (top.length === 1 && headings.length > 1) {
    title = top[0].text
    titleLine = top[0].line
    candidates = headings.filter((h) => h !== top[0])
  }
  const splitLevel = Math.min(...candidates.map((h) => h.level))
  const splits = candidates.filter((h) => h.level === splitLevel)

  const sections: CourseSection[] = []
  const firstLine = splits[0].line
  const intro = lines
    .slice(0, firstLine)
    .filter((_, i) => i !== titleLine)
    .join('\n')
    .trim()
  if (intro) sections.push({ title: 'Introduction', markdown: intro })

  splits.forEach((heading, i) => {
    const end = i + 1 < splits.length ? splits[i + 1].line : lines.length
    sections.push({
      title: heading.text,
      markdown: lines.slice(heading.line, end).join('\n').trim(),
    })
  })
  return { title, sections }
}
