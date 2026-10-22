/** Client HTTP de l'API du projet (voir docs/API.md à la racine du dépôt). */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type Role = 'student' | 'trainer'
export type Difficulty = 'easy' | 'medium' | 'hard'

export type User = { id: string; email: string; display_name: string; role: Role; created_at: string }
export type AuthResponse = { token: string; user: User }

export type Quiz = {
  id: string
  author_id: string
  title: string
  description: string | null
  theme: string
  difficulty: Difficulty
  seconds_per_question: number
  is_published: boolean
  created_at: string
}

export type QuizDraft = Pick<Quiz, 'title' | 'theme' | 'difficulty' | 'seconds_per_question' | 'is_published'> & {
  description?: string
}

export type QuestionType = 'mcq' | 'true_false' | 'free_text'
export type Answer = { id: string; question_id: string; label: string; /** Absent pour l'élève avant la fin. */ is_correct?: boolean | null }
export type Question = {
  id: string
  quiz_id: string
  type: QuestionType
  statement: string
  explanation: string | null
  image_url: string | null
  points: number
  position: number
  answers: Answer[]
}
export type QuizDetail = Quiz & { questions: Question[] }
export type QuestionDraft = {
  type: QuestionType
  statement: string
  explanation?: string
  points: number
  answers: { label: string; is_correct: boolean }[]
}

export type Attempt = {
  id: string
  user_id: string
  quiz_id: string
  challenge_id: string | null
  started_at: string
  finished_at: string | null
  score: number | null
  total_time_ms: number | null
}
export type AnswerFeedback = { is_correct: boolean | null; timed_out: boolean; correct_answer_id: string | null; explanation: string | null }
export type Reward = {
  gained: number
  base: number
  mastered: number
  recovery: number
  multiplier: number
  capped: boolean
  levels_gained: number
  stage_changed: boolean
}
export type FinishedAttempt = Attempt & { reward: Reward | null }
export type LeaderboardEntry = { user_id: string; display_name: string; score: number; total_time_ms: number }
export type PendingAnswer = {
  attempt_answer_id: string
  attempt_id: string
  display_name: string
  statement: string
  expected: string | null
  free_text: string | null
}

export type ClassSummary = { id: string; name: string; trainer_name: string; join_code: string | null; member_count: number }
export type Member = { id: string; display_name: string }
export type ClassDetail = { id: string; name: string; join_code: string | null; members: Member[] }

export type EvaluationType = 'controle' | 'examen' | 'projet'
export type Evaluation = {
  id: string
  class_id: string
  class_name: string
  title: string
  type: EvaluationType
  theme: string | null
  /** AAAA-MM-JJ */
  date: string
}

export type Grade = {
  id: string
  class_id: string
  class_name: string
  student_id: string
  student_name: string
  evaluation_id: string | null
  evaluation_title: string | null
  subject: string
  value: number
  max: number
  coef: number
  graded_on: string
  /** Réglages du plan de rattrapage ouvert par cette note, `null` sinon. */
  recovery_target: number | null
  recovery_days: number | null
}
export type GradeOutcome = 'bonus' | 'recovery' | 'saved'
export type CreatedGrade = { id: string; student_id: string; outcome: GradeOutcome; xp_bonus: number }
/** `target` : bonnes réponses à obtenir ; `days` : durée personnalisée, déjà comptée dans `until`.
 *  Tous deux fixés par le formateur, `null` sinon (durée par défaut : 14 jours). */
export type RecoveryPlan = { subject: string; until: string; target: number | null; days: number | null }
export type MyGrades = { grades: Grade[]; average: number | null; recovery_plans: RecoveryPlan[] }

export type PetView = {
  name: string
  xp: number
  level: number
  /** Identifiant de stade de `domain/pet-stages.ts`. */
  stage: string
  xp_in_level: number
  xp_needed: number
  streak: number
  earned_today: number
  daily_cap: number
  last_active_day: string | null
  next_stage: { id: string; min_level: number } | null
}
export type XpRules = {
  quiz_base: number
  mastery_bonus: number
  daily_cap: number
  streak_max_bonus_pct: number
  challenge_win_bonus: number
  good_grade_bonus: number
  good_grade_threshold: number
  bad_grade_threshold: number
  recovery_bonus_per_answer: number
  recovery_bonus_max: number
}
export type MyPet = {
  pet: PetView
  recovery_plans: RecoveryPlan[]
  recent_events: { amount: number; reason: string; created_at: string }[]
  rules: XpRules
}

export type StudentCard = {
  id: string
  display_name: string
  pet: PetView
  average: number | null
  grade_count: number
  recovery_plans: RecoveryPlan[]
  quizzes_last_7_days: number
  last_quiz_at: string | null
}
export type Dashboard = { class_id: string; name: string; students: StudentCard[] }

/** Erreur renvoyée par l'API, avec son message en français. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let token: string | null = null

export function setToken(value: string | null) {
  token = value
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'API injoignable : vérifie que le backend est lancé (cargo run).')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`)
  }
  // Certaines routes répondent sans contenu (201 ou 204).
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
