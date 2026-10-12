export type Subject = { id: string; name: string; color: string }

export type Course = {
  id: string
  subjectId: string
  title: string
  markdown: string
  createdAt: number
}

export type DeadlineType = 'controle' | 'examen' | 'projet'
export type Deadline = {
  id: string
  subjectId: string
  type: DeadlineType
  date: number
  courseIds: string[]
}

export type CardType = 'flashcard' | 'cloze' | 'quiz'
export type Card = {
  id: string
  courseId: string
  type: CardType
  /** Question, ou texte avec trous marqués {{...}} */
  front: string
  /** Réponse */
  back: string
  /** Pour quiz : mauvaises réponses */
  choices?: string[]
  createdAt: number
}

export type ReviewResult = 'again' | 'hard' | 'good' | 'easy'
export type Review = {
  id: string
  cardId: string
  date: number
  result: ReviewResult
  nextDue: number
  /** En jours */
  interval: number
  ease: number
}

export type Grade = {
  id: string
  subjectId: string
  value: number
  max: number
  coef: number
  date: number
}

export type Pet = {
  id: string
  species: string
  name: string
  xp: number
  level: number
  stage: number
  streak: number
}
