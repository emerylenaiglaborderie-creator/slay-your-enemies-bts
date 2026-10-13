//! Défis entre étudiants (F-008, E-007), notifiés sur les rooms `user:{id}` et `challenge:{id}`.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::challenge::{Challenge, ChallengeStatus},
    routes::{pet, quizzes},
    xp, AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/challenges", get(list_challenges).post(create_challenge))
        .route("/challenges/{id}", get(get_challenge).patch(respond))
}

/// Charge un défi dont l'utilisateur est l'un des deux participants.
pub async fn participant_challenge(state: &AppState, auth: &AuthUser, id: Uuid) -> AppResult<Challenge> {
    let challenge = sqlx::query_as::<_, Challenge>(
        "SELECT id, quiz_id, challenger_id, challenged_id, status, created_at FROM challenges WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if challenge.challenger_id != auth.id && challenge.challenged_id != auth.id {
        return Err(AppError::NotFound);
    }
    Ok(challenge)
}

#[derive(Serialize, sqlx::FromRow)]
struct ChallengeView {
    id: Uuid,
    quiz_id: Uuid,
    quiz_title: String,
    challenger_id: Uuid,
    challenger_name: String,
    challenger_score: Option<i32>,
    challenger_time_ms: Option<i32>,
    challenged_id: Uuid,
    challenged_name: String,
    challenged_score: Option<i32>,
    challenged_time_ms: Option<i32>,
    status: ChallengeStatus,
    created_at: chrono::DateTime<chrono::Utc>,
}

const VIEW_SQL: &str = "
    SELECT c.id, c.quiz_id, z.title AS quiz_title,
           c.challenger_id, u1.display_name AS challenger_name, a1.score AS challenger_score, a1.total_time_ms AS challenger_time_ms,
           c.challenged_id, u2.display_name AS challenged_name, a2.score AS challenged_score, a2.total_time_ms AS challenged_time_ms,
           c.status, c.created_at
    FROM challenges c
    JOIN quizzes z ON z.id = c.quiz_id
    JOIN users u1 ON u1.id = c.challenger_id
    JOIN users u2 ON u2.id = c.challenged_id
    LEFT JOIN attempts a1 ON a1.challenge_id = c.id AND a1.user_id = c.challenger_id AND a1.finished_at IS NOT NULL
    LEFT JOIN attempts a2 ON a2.challenge_id = c.id AND a2.user_id = c.challenged_id AND a2.finished_at IS NOT NULL";

async fn view(state: &AppState, id: Uuid) -> AppResult<ChallengeView> {
    Ok(sqlx::query_as::<_, ChallengeView>(sqlx::AssertSqlSafe(format!("{VIEW_SQL} WHERE c.id = $1")))
        .bind(id)
        .fetch_one(&state.db)
        .await?)
}

async fn notify(state: &AppState, id: Uuid) -> AppResult<()> {
    let v = view(state, id).await?;
    let msg = json!({ "type": "challenge", "challenge": &v });
    state.hub.publish(&format!("challenge:{id}"), msg.clone());
    state.hub.publish(&format!("user:{}", v.challenger_id), msg.clone());
    state.hub.publish(&format!("user:{}", v.challenged_id), msg);
    Ok(())
}

async fn list_challenges(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<Vec<ChallengeView>>> {
    let rows = sqlx::query_as::<_, ChallengeView>(sqlx::AssertSqlSafe(format!(
        "{VIEW_SQL} WHERE c.challenger_id = $1 OR c.challenged_id = $1 ORDER BY c.created_at DESC"
    )))
    .bind(auth.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn get_challenge(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<ChallengeView>> {
    participant_challenge(&state, &auth, id).await?;
    Ok(Json(view(&state, id).await?))
}

#[derive(Deserialize)]
struct CreateBody {
    quiz_id: Uuid,
    challenged_id: Uuid,
}

async fn create_challenge(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateBody>,
) -> AppResult<(StatusCode, Json<ChallengeView>)> {
    let quiz = quizzes::visible_quiz(&state, &auth, body.quiz_id).await?;
    if !quiz.is_published {
        return Err(AppError::BadRequest("quiz non publié".into()));
    }
    if body.challenged_id == auth.id {
        return Err(AppError::BadRequest("impossible de se défier soi-même".into()));
    }
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)")
        .bind(body.challenged_id)
        .fetch_one(&state.db)
        .await?;
    if !exists {
        return Err(AppError::NotFound);
    }
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO challenges (quiz_id, challenger_id, challenged_id) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(quiz.id)
    .bind(auth.id)
    .bind(body.challenged_id)
    .fetch_one(&state.db)
    .await?;
    notify(&state, id).await?;
    Ok((StatusCode::CREATED, Json(view(&state, id).await?)))
}

#[derive(Deserialize)]
struct RespondBody {
    status: ChallengeStatus,
}

/// Le défié accepte ou refuse un défi en attente.
async fn respond(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<RespondBody>,
) -> AppResult<Json<ChallengeView>> {
    let challenge = participant_challenge(&state, &auth, id).await?;
    if challenge.challenged_id != auth.id {
        return Err(AppError::Forbidden);
    }
    if !matches!(body.status, ChallengeStatus::Accepted | ChallengeStatus::Declined) {
        return Err(AppError::BadRequest("statut attendu : accepted ou declined".into()));
    }
    let updated = sqlx::query("UPDATE challenges SET status = $2 WHERE id = $1 AND status = 'pending'")
        .bind(id)
        .bind(body.status)
        .execute(&state.db)
        .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::Conflict("défi déjà traité".into()));
    }
    notify(&state, id).await?;
    Ok(Json(view(&state, id).await?))
}

/// Passe le défi à `completed` quand les deux participants ont terminé leur tentative.
pub async fn complete_if_both_finished(state: &AppState, id: Uuid) -> AppResult<()> {
    let mut tx = state.db.begin().await?;
    let completed = sqlx::query(
        "UPDATE challenges c SET status = 'completed'
         WHERE c.id = $1 AND c.status = 'accepted'
           AND (SELECT COUNT(DISTINCT user_id) FROM attempts
                WHERE challenge_id = c.id AND finished_at IS NOT NULL) = 2",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?
    .rows_affected()
        == 1;
    if completed {
        // Meilleur score, puis temps le plus court ; aucune XP en cas d'égalité parfaite.
        let ranking: Vec<(Uuid, i32, i32)> = sqlx::query_as(
            "SELECT user_id, COALESCE(score, 0), COALESCE(total_time_ms, 0) FROM attempts
             WHERE challenge_id = $1 AND finished_at IS NOT NULL
             ORDER BY score DESC NULLS LAST, total_time_ms ASC",
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
        if let [first, second, ..] = ranking.as_slice()
            && (first.1, first.2) != (second.1, second.2)
        {
            pet::award_bonus(&mut tx, first.0, xp::CHALLENGE_WIN_BONUS, "challenge_won", id).await?;
        }
    }
    tx.commit().await?;
    notify(state, id).await
}
