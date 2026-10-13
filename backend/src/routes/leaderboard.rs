//! Classement par quiz (E-005), diffusé en temps réel sur la room `quiz:{id}` (T-004).

use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use serde_json::json;
use uuid::Uuid;

use crate::{error::AppResult, middleware::auth::AuthUser, routes::quizzes, AppState};

const LEADERBOARD_SIZE: i64 = 50;

pub fn router() -> Router<AppState> {
    Router::new().route("/quizzes/{id}/leaderboard", get(get_leaderboard))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct LeaderboardEntry {
    pub user_id: Uuid,
    pub display_name: String,
    pub score: i32,
    pub total_time_ms: i32,
}

/// Meilleure tentative de chaque étudiant : score décroissant, puis temps croissant.
pub async fn compute(state: &AppState, quiz_id: Uuid) -> AppResult<Vec<LeaderboardEntry>> {
    Ok(sqlx::query_as::<_, LeaderboardEntry>(
        "SELECT * FROM (
             SELECT DISTINCT ON (a.user_id)
                    a.user_id, u.display_name, a.score, COALESCE(a.total_time_ms, 0) AS total_time_ms
             FROM attempts a JOIN users u ON u.id = a.user_id
             WHERE a.quiz_id = $1 AND a.finished_at IS NOT NULL AND a.score IS NOT NULL
             ORDER BY a.user_id, a.score DESC, a.total_time_ms ASC
         ) best
         ORDER BY score DESC, total_time_ms ASC
         LIMIT $2",
    )
    .bind(quiz_id)
    .bind(LEADERBOARD_SIZE)
    .fetch_all(&state.db)
    .await?)
}

pub async fn broadcast(state: &AppState, quiz_id: Uuid) -> AppResult<()> {
    let entries = compute(state, quiz_id).await?;
    state.hub.publish(
        &format!("quiz:{quiz_id}"),
        json!({ "type": "leaderboard", "quiz_id": quiz_id, "entries": entries }),
    );
    Ok(())
}

async fn get_leaderboard(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<LeaderboardEntry>>> {
    quizzes::visible_quiz(&state, &auth, id).await?;
    Ok(Json(compute(&state, id).await?))
}
