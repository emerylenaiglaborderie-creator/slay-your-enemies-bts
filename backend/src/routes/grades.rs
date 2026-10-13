//! Notes : saisies par le formateur pour sa classe, consultées par l'élève.
//! Une bonne note récente fait gagner de l'XP ; une mauvaise ouvre un plan de rattrapage.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::user::UserRole,
    routes::{classes::owned_class, pet},
    xp::{self, GradeLevel, RecoveryPlan},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/classes/{id}/grades", get(class_grades).post(create_grades))
        .route("/grades/{id}", delete(delete_grade))
        .route("/me/grades", get(my_grades))
}

#[derive(Serialize, sqlx::FromRow)]
struct GradeRow {
    id: Uuid,
    class_id: Uuid,
    class_name: String,
    student_id: Uuid,
    student_name: String,
    evaluation_id: Option<Uuid>,
    evaluation_title: Option<String>,
    subject: String,
    value: f64,
    max: f64,
    coef: f64,
    graded_on: NaiveDate,
}

const SELECT: &str = "SELECT g.id, g.class_id, c.name AS class_name, g.student_id, u.display_name AS student_name,
                             g.evaluation_id, e.title AS evaluation_title, g.subject, g.value, g.max, g.coef, g.graded_on
                      FROM grades g
                      JOIN classes c ON c.id = g.class_id
                      JOIN users u ON u.id = g.student_id
                      LEFT JOIN evaluations e ON e.id = g.evaluation_id";

async fn class_grades(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<Vec<GradeRow>>> {
    owned_class(&state, &auth, id).await?;
    let rows = sqlx::query_as::<_, GradeRow>(sqlx::AssertSqlSafe(format!(
        "{SELECT} WHERE g.class_id = $1 ORDER BY g.graded_on DESC, u.display_name"
    )))
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct Entry {
    student_id: Uuid,
    value: f64,
}

#[derive(Deserialize)]
struct GradesBody {
    /// Optionnel si `evaluation_id` est donné : le thème (ou le titre) de l'évaluation est repris.
    subject: Option<String>,
    evaluation_id: Option<Uuid>,
    #[serde(default = "default_max")]
    max: f64,
    #[serde(default = "default_coef")]
    coef: f64,
    graded_on: NaiveDate,
    entries: Vec<Entry>,
}

fn default_max() -> f64 {
    20.0
}

fn default_coef() -> f64 {
    1.0
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum Outcome {
    /// Bonne note récente : bonus d'XP.
    Bonus,
    /// Mauvaise note : plan de rattrapage ouvert.
    Recovery,
    Saved,
}

#[derive(Serialize)]
struct Created {
    id: Uuid,
    student_id: Uuid,
    outcome: Outcome,
    xp_bonus: i32,
}

/// Saisie d'une ou plusieurs notes (par exemple toute la classe pour une évaluation).
async fn create_grades(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<Uuid>,
    Json(body): Json<GradesBody>,
) -> AppResult<(StatusCode, Json<Vec<Created>>)> {
    owned_class(&state, &auth, class_id).await?;
    if !(body.max > 0.0 && body.max <= 1000.0) || !(body.coef > 0.0 && body.coef <= 100.0) {
        return Err(AppError::BadRequest("barème et coefficient doivent être positifs".into()));
    }
    if body.entries.is_empty() {
        return Err(AppError::BadRequest("aucune note à enregistrer".into()));
    }
    if let Some(e) = body.entries.iter().find(|e| !(0.0..=body.max).contains(&e.value)) {
        return Err(AppError::BadRequest(format!("note {} hors barème (0 à {})", e.value, body.max)));
    }

    let mut tx = state.db.begin().await?;
    let today = pet::today(&mut tx).await?;
    if body.graded_on > today {
        return Err(AppError::BadRequest("la date ne peut pas être dans le futur".into()));
    }
    let evaluation_subject = match body.evaluation_id {
        Some(eid) => Some(
            sqlx::query_scalar::<_, String>(
                "SELECT COALESCE(NULLIF(theme, ''), title) FROM evaluations WHERE id = $1 AND class_id = $2",
            )
            .bind(eid)
            .bind(class_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::BadRequest("évaluation d'une autre classe".into()))?,
        ),
        None => None,
    };
    let subject = body
        .subject
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or(evaluation_subject)
        .ok_or_else(|| AppError::BadRequest("matière requise".into()))?;

    let mut created = Vec::with_capacity(body.entries.len());
    for entry in &body.entries {
        let member: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2)",
        )
        .bind(class_id)
        .bind(entry.student_id)
        .fetch_one(&mut *tx)
        .await?;
        if !member {
            return Err(AppError::BadRequest("élève hors de la classe".into()));
        }
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO grades (class_id, student_id, evaluation_id, subject, value, max, coef, graded_on)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        )
        .bind(class_id)
        .bind(entry.student_id)
        .bind(body.evaluation_id)
        .bind(&subject)
        .bind(entry.value)
        .bind(body.max)
        .bind(body.coef)
        .bind(body.graded_on)
        .fetch_one(&mut *tx)
        .await?;

        let (outcome, xp_bonus) = if xp::earns_good_grade_bonus(entry.value, body.max, body.graded_on, today) {
            pet::award_bonus(&mut tx, entry.student_id, xp::GOOD_GRADE_BONUS, "good_grade", id).await?;
            (Outcome::Bonus, xp::GOOD_GRADE_BONUS)
        } else if xp::grade_level(entry.value, body.max) == GradeLevel::Bad {
            (Outcome::Recovery, 0)
        } else {
            (Outcome::Saved, 0)
        };
        created.push(Created { id, student_id: entry.student_id, outcome, xp_bonus });
    }
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// Supprime une note. L'XP déjà gagnée reste acquise : le dragon ne régresse jamais.
async fn delete_grade(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let class_id: Uuid = sqlx::query_scalar("SELECT class_id FROM grades WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    owned_class(&state, &auth, class_id).await?;
    sqlx::query("DELETE FROM grades WHERE id = $1").bind(id).execute(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct MyGrades {
    grades: Vec<GradeRow>,
    /// Moyenne pondérée sur 20, toutes classes confondues.
    average: Option<f64>,
    recovery_plans: Vec<RecoveryPlan>,
}

async fn my_grades(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<MyGrades>> {
    if auth.role != UserRole::Student {
        return Err(AppError::Forbidden);
    }
    let mut conn = state.db.acquire().await?;
    let grades = sqlx::query_as::<_, GradeRow>(sqlx::AssertSqlSafe(format!(
        "{SELECT} WHERE g.student_id = $1 ORDER BY g.graded_on DESC"
    )))
    .bind(auth.id)
    .fetch_all(&mut *conn)
    .await?;
    let total_coef: f64 = grades.iter().map(|g| g.coef).sum();
    let average = (total_coef > 0.0).then(|| grades.iter().map(|g| xp::on20(g.value, g.max) * g.coef).sum::<f64>() / total_coef);
    let today = pet::today(&mut conn).await?;
    let recovery_plans = pet::recovery_plans(&mut conn, auth.id, today).await?;
    Ok(Json(MyGrades { grades, average, recovery_plans }))
}
