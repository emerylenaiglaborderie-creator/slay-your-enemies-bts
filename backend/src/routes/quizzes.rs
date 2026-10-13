//! Quiz et questions côté formateur (F-001 à F-003, F-005, F-007) et accès étudiant (E-001).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::{
        question::{Answer, Question, QuestionType, QuestionWithAnswers},
        quiz::{Difficulty, Quiz},
        user::UserRole,
    },
    routes::attempts::recompute_score,
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/quizzes", get(list_quizzes).post(create_quiz))
        .route("/quizzes/{id}", get(get_quiz).patch(update_quiz).delete(delete_quiz))
        .route("/quizzes/{id}/questions", post(create_question))
        .route("/quizzes/{id}/stats", get(quiz_stats))
        .route("/quizzes/{id}/pending-answers", get(pending_free_text))
        .route("/questions/{id}", put(update_question).delete(delete_question))
        .route("/attempt-answers/{id}/grade", patch(grade_free_text))
}


/// Charge un quiz et vérifie que l'utilisateur en est l'auteur.
pub async fn owned_quiz(state: &AppState, auth: &AuthUser, quiz_id: Uuid) -> AppResult<Quiz> {
    auth.require_trainer()?;
    let quiz = sqlx::query_as::<_, Quiz>(
        "SELECT id, author_id, title, description, theme, difficulty, seconds_per_question, is_published, created_at
         FROM quizzes WHERE id = $1",
    )
    .bind(quiz_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if quiz.author_id != auth.id {
        return Err(AppError::Forbidden);
    }
    Ok(quiz)
}

/// Un quiz est visible s'il est publié, ou par son auteur.
pub async fn visible_quiz(state: &AppState, auth: &AuthUser, quiz_id: Uuid) -> AppResult<Quiz> {
    let quiz = sqlx::query_as::<_, Quiz>(
        "SELECT id, author_id, title, description, theme, difficulty, seconds_per_question, is_published, created_at
         FROM quizzes WHERE id = $1",
    )
    .bind(quiz_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if !quiz.is_published && quiz.author_id != auth.id {
        return Err(AppError::NotFound);
    }
    Ok(quiz)
}

#[derive(Deserialize)]
struct QuizFilters {
    theme: Option<String>,
    difficulty: Option<Difficulty>,
    author_id: Option<Uuid>,
}

async fn list_quizzes(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(f): Query<QuizFilters>,
) -> AppResult<Json<Vec<Quiz>>> {
    let quizzes = sqlx::query_as::<_, Quiz>(
        "SELECT id, author_id, title, description, theme, difficulty, seconds_per_question, is_published, created_at
         FROM quizzes
         WHERE (is_published OR author_id = $1)
           AND ($2::text IS NULL OR theme = $2)
           AND ($3::difficulty_level IS NULL OR difficulty = $3)
           AND ($4::uuid IS NULL OR author_id = $4)
         ORDER BY created_at DESC",
    )
    .bind(auth.id)
    .bind(f.theme)
    .bind(f.difficulty)
    .bind(f.author_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(quizzes))
}

#[derive(Deserialize)]
struct QuizBody {
    title: String,
    description: Option<String>,
    theme: String,
    difficulty: Difficulty,
    seconds_per_question: i32,
    #[serde(default)]
    is_published: bool,
}

impl QuizBody {
    fn validate(&self) -> AppResult<()> {
        if self.title.trim().is_empty() || self.theme.trim().is_empty() {
            return Err(AppError::BadRequest("titre et thème requis".into()));
        }
        if !(5..=600).contains(&self.seconds_per_question) {
            return Err(AppError::BadRequest("temps par question entre 5 et 600 secondes".into()));
        }
        Ok(())
    }
}

async fn create_quiz(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<QuizBody>,
) -> AppResult<(StatusCode, Json<Quiz>)> {
    auth.require_trainer()?;
    body.validate()?;
    let quiz = sqlx::query_as::<_, Quiz>(
        "INSERT INTO quizzes (author_id, title, description, theme, difficulty, seconds_per_question, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, author_id, title, description, theme, difficulty, seconds_per_question, is_published, created_at",
    )
    .bind(auth.id)
    .bind(body.title.trim())
    .bind(body.description)
    .bind(body.theme.trim())
    .bind(body.difficulty)
    .bind(body.seconds_per_question)
    .bind(body.is_published)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(quiz)))
}

#[derive(Serialize)]
struct QuizDetail {
    #[serde(flatten)]
    quiz: Quiz,
    questions: Vec<QuestionWithAnswers>,
}

/// Questions d'un quiz avec leurs réponses. `reveal` contrôle l'exposition de `is_correct`.
pub async fn load_questions(state: &AppState, quiz_id: Uuid, reveal: bool) -> AppResult<Vec<QuestionWithAnswers>> {
    let questions = sqlx::query_as::<_, Question>(
        "SELECT id, quiz_id, type, statement, explanation, image_url, points, position
         FROM questions WHERE quiz_id = $1 ORDER BY position",
    )
    .bind(quiz_id)
    .fetch_all(&state.db)
    .await?;
    let mut answers = sqlx::query_as::<_, Answer>(
        "SELECT a.id, a.question_id, a.label, a.is_correct
         FROM answers a JOIN questions q ON q.id = a.question_id
         WHERE q.quiz_id = $1 ORDER BY a.id",
    )
    .bind(quiz_id)
    .fetch_all(&state.db)
    .await?;

    Ok(questions
        .into_iter()
        .map(|question| {
            let mut own: Vec<Answer> = Vec::new();
            answers.retain_mut(|a| {
                if a.question_id != question.id {
                    return true;
                }
                own.push(Answer { id: a.id, question_id: a.question_id, label: std::mem::take(&mut a.label), is_correct: a.is_correct });
                false
            });
            // La réponse attendue d'un texte libre ne doit jamais fuiter avant correction.
            if !reveal {
                if question.kind == QuestionType::FreeText {
                    own.clear();
                }
                own.iter_mut().for_each(|a| a.is_correct = None);
            }
            QuestionWithAnswers { question, answers: own }
        })
        .collect())
}

async fn get_quiz(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<QuizDetail>> {
    let quiz = visible_quiz(&state, &auth, id).await?;
    let reveal = quiz.author_id == auth.id;
    let questions = load_questions(&state, id, reveal).await?;
    Ok(Json(QuizDetail { quiz, questions }))
}

async fn update_quiz(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<QuizBody>,
) -> AppResult<Json<Quiz>> {
    owned_quiz(&state, &auth, id).await?;
    body.validate()?;
    let quiz = sqlx::query_as::<_, Quiz>(
        "UPDATE quizzes SET title = $2, description = $3, theme = $4, difficulty = $5,
                seconds_per_question = $6, is_published = $7
         WHERE id = $1
         RETURNING id, author_id, title, description, theme, difficulty, seconds_per_question, is_published, created_at",
    )
    .bind(id)
    .bind(body.title.trim())
    .bind(body.description)
    .bind(body.theme.trim())
    .bind(body.difficulty)
    .bind(body.seconds_per_question)
    .bind(body.is_published)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(quiz))
}

async fn delete_quiz(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    owned_quiz(&state, &auth, id).await?;
    sqlx::query("DELETE FROM quizzes WHERE id = $1").bind(id).execute(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct AnswerBody {
    label: String,
    is_correct: bool,
}

#[derive(Deserialize)]
struct QuestionBody {
    #[serde(rename = "type")]
    kind: QuestionType,
    statement: String,
    explanation: Option<String>,
    image_url: Option<String>,
    #[serde(default = "default_points")]
    points: i32,
    /// Absent : ajoutée en fin de quiz.
    position: Option<i32>,
    #[serde(default)]
    answers: Vec<AnswerBody>,
}

fn default_points() -> i32 {
    1
}

impl QuestionBody {
    fn validate(&self) -> AppResult<()> {
        if self.statement.trim().is_empty() {
            return Err(AppError::BadRequest("énoncé requis".into()));
        }
        if self.points < 0 {
            return Err(AppError::BadRequest("points négatifs".into()));
        }
        let correct = self.answers.iter().filter(|a| a.is_correct).count();
        match self.kind {
            QuestionType::Mcq if self.answers.len() < 2 || correct == 0 => Err(AppError::BadRequest(
                "un QCM demande au moins 2 réponses dont une correcte".into(),
            )),
            QuestionType::TrueFalse if self.answers.len() != 2 || correct != 1 => Err(AppError::BadRequest(
                "un Vrai/Faux demande exactement 2 réponses dont une correcte".into(),
            )),
            QuestionType::FreeText if self.answers.len() > 1 => Err(AppError::BadRequest(
                "un texte libre accepte au plus une réponse attendue".into(),
            )),
            _ => Ok(()),
        }
    }
}

async fn insert_answers(tx: &mut sqlx::PgConnection, question_id: Uuid, answers: &[AnswerBody]) -> AppResult<()> {
    for a in answers {
        sqlx::query("INSERT INTO answers (question_id, label, is_correct) VALUES ($1, $2, $3)")
            .bind(question_id)
            .bind(a.label.trim())
            .bind(a.is_correct)
            .execute(&mut *tx)
            .await?;
    }
    Ok(())
}

async fn create_question(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(quiz_id): Path<Uuid>,
    Json(body): Json<QuestionBody>,
) -> AppResult<StatusCode> {
    owned_quiz(&state, &auth, quiz_id).await?;
    body.validate()?;
    let mut tx = state.db.begin().await?;
    let question_id: Uuid = sqlx::query_scalar(
        "INSERT INTO questions (quiz_id, type, statement, explanation, image_url, points, position)
         VALUES ($1, $2, $3, $4, $5, $6,
                 COALESCE($7, (SELECT COALESCE(MAX(position), 0) + 1 FROM questions WHERE quiz_id = $1)))
         RETURNING id",
    )
    .bind(quiz_id)
    .bind(body.kind)
    .bind(body.statement.trim())
    .bind(body.explanation)
    .bind(body.image_url)
    .bind(body.points)
    .bind(body.position)
    .fetch_one(&mut *tx)
    .await
    .map_err(position_conflict)?;
    insert_answers(&mut tx, question_id, &body.answers).await?;
    tx.commit().await?;
    Ok(StatusCode::CREATED)
}

fn position_conflict(e: sqlx::Error) -> AppError {
    match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => AppError::Conflict("position déjà prise".into()),
        _ => e.into(),
    }
}

/// Vérifie que la question appartient à un quiz de l'utilisateur et renvoie l'id du quiz.
async fn owned_question(state: &AppState, auth: &AuthUser, question_id: Uuid) -> AppResult<Uuid> {
    let quiz_id: Uuid = sqlx::query_scalar("SELECT quiz_id FROM questions WHERE id = $1")
        .bind(question_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    owned_quiz(state, auth, quiz_id).await?;
    Ok(quiz_id)
}

/// Remplace la question et toutes ses réponses (F-002).
async fn update_question(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<QuestionBody>,
) -> AppResult<StatusCode> {
    owned_question(&state, &auth, id).await?;
    body.validate()?;
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE questions SET type = $2, statement = $3, explanation = $4, image_url = $5, points = $6,
                position = COALESCE($7, position)
         WHERE id = $1",
    )
    .bind(id)
    .bind(body.kind)
    .bind(body.statement.trim())
    .bind(body.explanation)
    .bind(body.image_url)
    .bind(body.points)
    .bind(body.position)
    .execute(&mut *tx)
    .await
    .map_err(position_conflict)?;
    sqlx::query("DELETE FROM answers WHERE question_id = $1").bind(id).execute(&mut *tx).await?;
    insert_answers(&mut tx, id, &body.answers).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_question(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    owned_question(&state, &auth, id).await?;
    sqlx::query("DELETE FROM questions WHERE id = $1").bind(id).execute(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize, sqlx::FromRow)]
struct QuestionStats {
    question_id: Uuid,
    statement: String,
    answered: i64,
    failed: i64,
    avg_time_ms: Option<f64>,
}

#[derive(Serialize, sqlx::FromRow)]
struct StudentStats {
    user_id: Uuid,
    display_name: String,
    attempts: i64,
    best_score: Option<i32>,
    avg_score: Option<f64>,
}

#[derive(Serialize)]
struct QuizStats {
    questions: Vec<QuestionStats>,
    students: Vec<StudentStats>,
}

/// Statistiques par question et par étudiant (F-005), calculées sur `attempt_answers`.
async fn quiz_stats(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<QuizStats>> {
    owned_quiz(&state, &auth, id).await?;
    let questions = sqlx::query_as::<_, QuestionStats>(
        "SELECT q.id AS question_id, q.statement,
                COUNT(aa.id) AS answered,
                COUNT(aa.id) FILTER (WHERE aa.is_correct = false) AS failed,
                AVG(aa.time_ms)::float8 AS avg_time_ms
         FROM questions q LEFT JOIN attempt_answers aa ON aa.question_id = q.id
         WHERE q.quiz_id = $1
         GROUP BY q.id ORDER BY failed DESC, q.position",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let students = sqlx::query_as::<_, StudentStats>(
        "SELECT u.id AS user_id, u.display_name, COUNT(a.id) AS attempts,
                MAX(a.score) AS best_score, AVG(a.score)::float8 AS avg_score
         FROM attempts a JOIN users u ON u.id = a.user_id
         WHERE a.quiz_id = $1 AND a.finished_at IS NOT NULL
         GROUP BY u.id ORDER BY best_score DESC NULLS LAST",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(QuizStats { questions, students }))
}

#[derive(Serialize, sqlx::FromRow)]
struct PendingAnswer {
    attempt_answer_id: Uuid,
    attempt_id: Uuid,
    display_name: String,
    statement: String,
    expected: Option<String>,
    free_text: Option<String>,
}

/// Réponses en texte libre en attente de correction manuelle (F-007).
async fn pending_free_text(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<PendingAnswer>>> {
    owned_quiz(&state, &auth, id).await?;
    let rows = sqlx::query_as::<_, PendingAnswer>(
        "SELECT aa.id AS attempt_answer_id, aa.attempt_id, u.display_name, q.statement,
                (SELECT label FROM answers WHERE question_id = q.id AND is_correct LIMIT 1) AS expected,
                aa.free_text
         FROM attempt_answers aa
         JOIN questions q ON q.id = aa.question_id
         JOIN attempts a ON a.id = aa.attempt_id
         JOIN users u ON u.id = a.user_id
         WHERE q.quiz_id = $1 AND q.type = 'free_text' AND aa.is_correct IS NULL
         ORDER BY a.started_at",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct GradeBody {
    is_correct: bool,
}

async fn grade_free_text(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<GradeBody>,
) -> AppResult<StatusCode> {
    auth.require_trainer()?;
    let (attempt_id, quiz_id, author_id): (Uuid, Uuid, Uuid) = sqlx::query_as(
        "SELECT a.id, a.quiz_id, z.author_id
         FROM attempt_answers aa
         JOIN attempts a ON a.id = aa.attempt_id
         JOIN quizzes z ON z.id = a.quiz_id
         WHERE aa.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if author_id != auth.id || auth.role != UserRole::Trainer {
        return Err(AppError::Forbidden);
    }
    sqlx::query("UPDATE attempt_answers SET is_correct = $2 WHERE id = $1")
        .bind(id)
        .bind(body.is_correct)
        .execute(&state.db)
        .await?;
    recompute_score(&state, attempt_id, quiz_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
