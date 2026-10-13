//! Dates d'évaluation d'une classe : saisies par le formateur, consultées par les élèves.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    routes::classes::owned_class,
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/evaluations", get(list_evaluations))
        .route("/classes/{id}/evaluations", post(create_evaluation))
        .route("/evaluations/{id}", delete(delete_evaluation))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "evaluation_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum EvaluationType {
    Controle,
    Examen,
    Projet,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Evaluation {
    id: Uuid,
    class_id: Uuid,
    class_name: String,
    title: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    kind: EvaluationType,
    theme: Option<String>,
    date: NaiveDate,
}

const SELECT: &str = "SELECT e.id, e.class_id, c.name AS class_name, e.title, e.type, e.theme, e.date
                      FROM evaluations e JOIN classes c ON c.id = e.class_id";

/// Évaluations des classes du formateur, ou des classes rejointes par l'élève.
async fn list_evaluations(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<Vec<Evaluation>>> {
    let rows = sqlx::query_as::<_, Evaluation>(sqlx::AssertSqlSafe(format!(
        "{SELECT}
         WHERE c.trainer_id = $1
            OR EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.id AND m.student_id = $1)
         ORDER BY e.date, e.title"
    )))
    .bind(auth.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct EvaluationBody {
    title: String,
    #[serde(rename = "type")]
    kind: EvaluationType,
    theme: Option<String>,
    date: NaiveDate,
}

async fn create_evaluation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<Uuid>,
    Json(body): Json<EvaluationBody>,
) -> AppResult<(StatusCode, Json<Evaluation>)> {
    owned_class(&state, &auth, class_id).await?;
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("titre requis".into()));
    }
    let theme = body.theme.as_deref().map(str::trim).filter(|t| !t.is_empty());
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO evaluations (class_id, title, type, theme, date) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(class_id)
    .bind(title)
    .bind(body.kind)
    .bind(theme)
    .bind(body.date)
    .fetch_one(&state.db)
    .await?;
    let evaluation = sqlx::query_as::<_, Evaluation>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE e.id = $1")))
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(evaluation)))
}

async fn delete_evaluation(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let class_id: Uuid = sqlx::query_scalar("SELECT class_id FROM evaluations WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    owned_class(&state, &auth, class_id).await?;
    sqlx::query("DELETE FROM evaluations WHERE id = $1").bind(id).execute(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}
