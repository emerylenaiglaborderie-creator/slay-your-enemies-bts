import { describe, expect, it } from 'vitest'
import { splitMarkdownCourse, titleFromFilename } from './markdown-import'

describe('import Markdown', () => {
  it('utilise un H1 unique comme titre et découpe par H2', () => {
    const md = '# Histoire\n\nPréambule.\n\n## Chapitre 1\nA\n\n### Détail\nB\n\n## Chapitre 2\nC'
    const { title, sections } = splitMarkdownCourse(md, 'fichier')
    expect(title).toBe('Histoire')
    expect(sections.map((s) => s.title)).toEqual(['Introduction', 'Chapitre 1', 'Chapitre 2'])
    expect(sections[0].markdown).toBe('Préambule.')
    expect(sections[1].markdown).toContain('### Détail')
  })

  it('découpe par H1 quand il y en a plusieurs', () => {
    const { title, sections } = splitMarkdownCourse('# A\nx\n# B\ny', 'fichier')
    expect(title).toBe('fichier')
    expect(sections.map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('ignore les titres dans les blocs de code', () => {
    const md = '## A\n```\n## pas un titre\n```\n## B'
    expect(splitMarkdownCourse(md, 'f').sections.map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('garde le cours entier sans titres', () => {
    expect(splitMarkdownCourse('Juste du texte', 'Notes').sections).toEqual([{ title: 'Notes', markdown: 'Juste du texte' }])
  })

  it('tire un titre lisible du nom de fichier', () => {
    expect(titleFromFilename('cours_svt-chap2.md')).toBe('cours svt chap2')
  })
})
