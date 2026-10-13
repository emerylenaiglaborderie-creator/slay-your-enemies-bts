//! Passage d'un quiz par un étudiant (E-002, E-003, E-006), correction automatique (F-007).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::{
        attempt::{Attempt, AttemptAnswer},
        challenge::ChallengeStatus,
        question::{QuestionType, QuestionWithAnswers},
        user::UserRole,
    },
    routes::{challenges, leaderboard, pet, quizzes},
    xp::Reward,
    AppState,
};

/// Marge réseau tolérée au-delà du temps imparti par question.
const TIMER_GRACE_MS: i32 = 1_000;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/attempts", post(start_attempt))
        .route("/attempts/{id}/answers", post(submit_answer))
        .route("/attempts/{id}/finish", post(finish_attempt))
        .route("/attempts/{id}/results", get(results))
        .route("/me/attempts", get(history))
}


async fn own_attempt(state: &AppState, auth: &AuthUser, id: Uuid) -> AppResult<Attempt> {
    let attempt = sqlx::query_as::<_, Attempt>(
        "SELECT id, user_id, quiz_id, challenge_id, started_at, finished_at, score, total_time_ms
         FROM attempts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if attempt.user_id != auth.id {
        return Err(AppError::NotFound);
    }
    Ok(attempt)
}

#[derive(Deserialize)]
struct StartBody {
    quiz_id: Uuid,
    challenge_id: Option<Uuid>,
}

async fn start_attempt(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<StartBody>,
) -> AppResult<(StatusCode, Json<Attempt>)> {
    let quiz = quizzes::visible_quiz(&state, &auth, body.quiz_id).await?;
    if !quiz.is_published {
        return Err(AppError::BadRequest("quiz non publié".into()));
    }
    if let Some(challenge_id) = body.challenge_id {
        let challenge = challenges::participant_challenge(&state, &auth, challenge_id).await?;
        if challenge.quiz_id != quiz.id || challenge.status != ChallengeStatus::Accepted {
            return Err(AppError::BadRequest("défi non accepté ou sur un autre quiz".into()));
        }
        let already: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM attempts WHERE challenge_id = $1 AND user_id = $2)",
        )
        .bind(challenge_id)
        .bind(auth.id)
        .fetch_one(&state.db)
        .await?;
        if already {
            return Err(AppError::Conflict("défi déjà joué".into()));
        }
    }
    let attempt = sqlx::query_as::<_, Attempt>(
        "INSERT INTO attempts (user_id, quiz_id, challenge_id) VALUES ($1, $2, $3)
         RETURNING id, user_id, quiz_id, challenge_id, started_at, finished_at, score, total_time_ms",
    )
    .bind(auth.id)
    .bind(quiz.id)
    .bind(body.challenge_id)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(attempt)))
}

#[derive(Deserialize)]
struct AnswerBody {
    question_id: Uuid,
    answer_id: Option<Uuid>,
    free_text: Option<String>,
    time_ms: i32,
}

#[derive(Serialize)]
struct AnswerFeedback {
    /// `null` pour un texte libre : correction manuelle par le formateur.
    is_correct: Option<bool>,
    timed_out: bool,
    correct_answer_id: Option<Uuid>,
    explanation: Option<String>,
}

async fn submit_answer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AnswerBody>,
) -> AppResult<Json<AnswerFeedback>> {
    let attempt = own_attempt(&state, &auth, id).await?;
    if attempt.finished_at.is_some() {
        return Err(AppError::BadRequest("tentative terminée".into()));
    }
    if body.time_ms < 0 {
        return Err(AppError::BadRequest("temps négatif".into()));
    }

    let (kind, explanation, seconds): (QuestionType, Option<String>, i32) = sqlx::query_as(
        "SELECT q.type, q.explanation, z.seconds_per_question
         FROM questions q JOIN quizzes z ON z.id = q.quiz_id
         WHERE q.id = $1 AND q.quiz_id = $2",
    )
    .bind(body.question_id)
    .bind(attempt.quiz_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("question hors du quiz".into()))?;

    // Timer (E-003) : une réponse hors délai compte comme fausse, quel que soit son type.
    let timed_out = body.time_ms > seconds * 1_000 + TIMER_GRACE_MS;
    let correct_answer_id: Option<Uuid> = if kind == QuestionType::FreeText {
        None
    } else {
        sqlx::query_scalar("SELECT id FROM answers WHERE question_id = $1 AND is_correct LIMIT 1")
            .bind(body.question_id)
            .fetch_optional(&state.db)
            .await?
    };

    let (answer_id, free_text, is_correct) = match kind {
        _ if timed_out => (None, None, Some(false)),
        QuestionType::FreeText => {
            let text = body.free_text.as_deref().map(str::trim).unwrap_or("");
            if text.is_empty() {
                (None, None, Some(false))
            } else {
                (None, Some(text.chars().take(2_000).collect::<String>()), None)
            }
        }
        QuestionType::Mcq | QuestionType::TrueFalse => match body.answer_id {
            // Pas de réponse (question passée) : fausse.
            None => (None, None, Some(false)),
            Some(answer_id) => {
                let correct: Option<bool> =
                    sqlx::query_scalar("SELECT is_correct FROM answers WHERE id = $1 AND question_id = $2")
                        .bind(answer_id)
                        .bind(body.question_id)
                        .fetch_optional(&state.db)
                        .await?
                        .ok_or_else(|| AppError::BadRequest("réponse hors de la question".into()))?;
                (Some(answer_id), None, Some(correct.unwrap_or(false)))
            }
        },
    };

    sqlx::query(
        "INSERT INTO attempt_answers (attempt_id, question_id, answer_id, free_text, is_correct, time_ms)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(body.question_id)
    .bind(answer_id)
    .bind(free_text)
    .bind(is_correct)
    .bind(body.time_ms)
    .execute(&state.db)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => AppError::Conflict("question déjà répondue".into()),
        _ => e.into(),
    })?;

    Ok(Json(AnswerFeedback { is_correct, timed_out, correct_answer_id, explanation }))
}

/// Recalcule le score d'une tentative terminée et diffuse le classement du quiz.
pub async fn recompute_score(state: &AppState, attempt_id: Uuid, quiz_id: Uuid) -> AppResult<()> {
    sqlx::query(
        "UPDATE attempts SET score = (
             SELECT COALESCE(SUM(q.points), 0)::int
             FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id
             WHERE aa.attempt_id = $1 AND aa.is_correct
         )
         WHERE id = $1 AND finished_at IS NOT NULL",
    )
    .bind(attempt_id)
    .execute(&state.db)
    .await?;
    leaderboard::broadcast(state, quiz_id).await
}

#[derive(Serialize)]
struct FinishResponse {
    #[serde(flatten)]
    attempt: Attempt,
    /// XP gagnée par le dragon (élèves seulement, `null` sans réponse).
    reward: Option<Reward>,
}

async fn finish_attempt(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<FinishResponse>> {
    let attempt = own_attempt(&state, &auth, id).await?;
    if attempt.finished_at.is_some() {
        return Err(AppError::Conflict("tentative déjà terminée".into()));
    }
    sqlx::query(
        "UPDATE attempts SET finished_at = now(),
                total_time_ms = (SELECT COALESCE(SUM(time_ms), 0)::int FROM attempt_answers WHERE attempt_id = $1)
         WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    recompute_score(&state, id, attempt.quiz_id).await?;
    let reward = if auth.role == UserRole::Student {
        let theme: String = sqlx::query_scalar("SELECT theme FROM quizzes WHERE id = $1")
            .bind(attempt.quiz_id)
            .fetch_one(&state.db)
            .await?;
        pet::award_quiz(&state, auth.id, id, &theme).await?
    } else {
        None
    };
    if let Some(challenge_id) = attempt.challenge_id {
        challenges::complete_if_both_finished(&state, challenge_id).await?;
    }
    Ok(Json(FinishResponse { attempt: own_attempt(&state, &auth, id).await?, reward }))
}

#[derive(Serialize)]
struct AttemptResults {
    attempt: Attempt,
    questions: Vec<QuestionWithAnswers>,
    answers: Vec<AttemptAnswer>,
}

/// Corrigé d'une tentative terminée, pour l'étudiant ou l'auteur du quiz.
async fn results(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<AttemptResults>> {
    let attempt = sqlx::query_as::<_, Attempt>(
        "SELECT id, user_id, quiz_id, challenge_id, started_at, finished_at, score, total_time_ms
         FROM attempts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let author_id: Uuid = sqlx::query_scalar("SELECT author_id FROM quizzes WHERE id = $1")
        .bind(attempt.quiz_id)
        .fetch_one(&state.db)
        .await?;
    if attempt.user_id != auth.id && author_id != auth.id {
        return Err(AppError::NotFound);
    }
    if attempt.finished_at.is_none() {
        return Err(AppError::BadRequest("tentative en cours".into()));
    }
    let questions = quizzes::load_questions(&state, attempt.quiz_id, true).await?;
    let answers = sqlx::query_as::<_, AttemptAnswer>(
        "SELECT id, attempt_id, question_id, answer_id, free_text, is_correct, time_ms
         FROM attempt_answers WHERE attempt_id = $1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(AttemptResults { attempt, questions, answers }))
}

#[derive(Serialize, sqlx::FromRow)]
struct HistoryRow {
    id: Uuid,
    quiz_id: Uuid,
    quiz_title: String,
    challenge_id: Option<Uuid>,
    finished_at: Option<chrono::DateTime<chrono::Utc>>,
    score: Option<i32>,
    max_score: i64,
    total_time_ms: Option<i32>,
}

/// Historique des tentatives de l'utilisateur (E-006).
async fn history(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<Vec<HistoryRow>>> {
    let rows = sqlx::query_as::<_, HistoryRow>(
        "SELECT a.id, a.quiz_id, z.title AS quiz_title, a.challenge_id, a.finished_at, a.score,
                (SELECT COALESCE(SUM(points), 0) FROM questions WHERE quiz_id = z.id) AS max_score,
                a.total_time_ms
         FROM attempts a JOIN quizzes z ON z.id = a.quiz_id
         WHERE a.user_id = $1 AND a.finished_at IS NOT NULL
         ORDER BY a.finished_at DESC",
    )
    .bind(auth.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}
