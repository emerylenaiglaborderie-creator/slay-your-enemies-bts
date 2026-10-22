//! Classes : le formateur en crée, les élèves les rejoignent avec un code.
//! Le tableau de bord montre le dragon, les notes et l'activité de chaque élève.

use std::collections::HashMap;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::user::UserRole,
    routes::pet::{self, PetRow, PetView},
    xp::{self, RecoveryPlan},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/classes", get(list_classes).post(create_class))
        .route("/classes/join", post(join_class))
        .route("/classes/{id}", get(get_class).delete(delete_class))
        .route("/classes/{id}/members/{student_id}", delete(remove_member))
        .route("/classes/{id}/dashboard", get(dashboard))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Class {
    pub id: Uuid,
    pub trainer_id: Uuid,
    pub name: String,
    pub join_code: String,
    pub created_at: DateTime<Utc>,
}

async fn load_class(state: &AppState, id: Uuid) -> AppResult<Class> {
    sqlx::query_as::<_, Class>("SELECT id, trainer_id, name, join_code, created_at FROM classes WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

/// Classe dont l'utilisateur est le formateur.
pub async fn owned_class(state: &AppState, auth: &AuthUser, id: Uuid) -> AppResult<Class> {
    auth.require_trainer()?;
    let class = load_class(state, id).await?;
    if class.trainer_id != auth.id {
        return Err(AppError::NotFound);
    }
    Ok(class)
}

pub async fn is_member(state: &AppState, class_id: Uuid, student_id: Uuid) -> AppResult<bool> {
    Ok(sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2)")
        .bind(class_id)
        .bind(student_id)
        .fetch_one(&state.db)
        .await?)
}

/// Code d'invitation lisible : 6 caractères sans 0/O ni 1/I.
fn new_join_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    Uuid::new_v4().as_bytes()[..6].iter().map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char).collect()
}

#[derive(Deserialize)]
struct ClassBody {
    name: String,
}

async fn create_class(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ClassBody>,
) -> AppResult<(StatusCode, Json<Class>)> {
    auth.require_trainer()?;
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::BadRequest("nom de classe : 1 à 60 caractères".into()));
    }
    // Un code peut déjà exister : on retente avec un autre.
    for _ in 0..5 {
        let created = sqlx::query_as::<_, Class>(
            "INSERT INTO classes (trainer_id, name, join_code) VALUES ($1, $2, $3)
             ON CONFLICT (join_code) DO NOTHING
             RETURNING id, trainer_id, name, join_code, created_at",
        )
        .bind(auth.id)
        .bind(name)
        .bind(new_join_code())
        .fetch_optional(&state.db)
        .await?;
        if let Some(class) = created {
            return Ok((StatusCode::CREATED, Json(class)));
        }
    }
    Err(AppError::Conflict("impossible de générer un code, réessaie".into()))
}

#[derive(Serialize, sqlx::FromRow)]
struct ClassSummary {
    id: Uuid,
    name: String,
    trainer_name: String,
    /// Visible du formateur seulement.
    join_code: Option<String>,
    member_count: i64,
}

async fn list_classes(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<Vec<ClassSummary>>> {
    let rows = sqlx::query_as::<_, ClassSummary>(
        "SELECT c.id, c.name, u.display_name AS trainer_name,
                CASE WHEN c.trainer_id = $1 THEN c.join_code END AS join_code,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
         FROM classes c JOIN users u ON u.id = c.trainer_id
         WHERE c.trainer_id = $1 OR EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.id AND m.student_id = $1)
         ORDER BY c.name",
    )
    .bind(auth.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
struct Member {
    id: Uuid,
    display_name: String,
}

#[derive(Serialize)]
struct ClassDetail {
    id: Uuid,
    name: String,
    join_code: Option<String>,
    members: Vec<Member>,
}

/// Détail d'une classe : visible du formateur et des élèves membres (utile pour lancer un défi).
async fn get_class(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<ClassDetail>> {
    let class = load_class(&state, id).await?;
    let owner = class.trainer_id == auth.id;
    if !owner && !is_member(&state, id, auth.id).await? {
        return Err(AppError::NotFound);
    }
    let members = sqlx::query_as::<_, Member>(
        "SELECT u.id, u.display_name FROM class_members m JOIN users u ON u.id = m.student_id
         WHERE m.class_id = $1 ORDER BY u.display_name",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(ClassDetail { id, name: class.name, join_code: owner.then_some(class.join_code), members }))
}

async fn delete_class(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    owned_class(&state, &auth, id).await?;
    sqlx::query("DELETE FROM classes WHERE id = $1").bind(id).execute(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct JoinBody {
    code: String,
}

async fn join_class(State(state): State<AppState>, auth: AuthUser, Json(body): Json<JoinBody>) -> AppResult<Json<ClassSummary>> {
    if auth.role != UserRole::Student {
        return Err(AppError::BadRequest("seuls les élèves rejoignent une classe".into()));
    }
    let class = sqlx::query_as::<_, Class>(
        "SELECT id, trainer_id, name, join_code, created_at FROM classes WHERE join_code = $1",
    )
    .bind(body.code.trim().to_uppercase())
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("code de classe inconnu".into()))?;
    sqlx::query("INSERT INTO class_members (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(class.id)
        .bind(auth.id)
        .execute(&state.db)
        .await?;
    let summary = sqlx::query_as::<_, ClassSummary>(
        "SELECT c.id, c.name, u.display_name AS trainer_name, NULL::text AS join_code,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
         FROM classes c JOIN users u ON u.id = c.trainer_id WHERE c.id = $1",
    )
    .bind(class.id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(summary))
}

/// Le formateur retire un élève, ou l'élève quitte la classe.
async fn remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((id, student_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    let class = load_class(&state, id).await?;
    if class.trainer_id != auth.id && student_id != auth.id {
        return Err(AppError::Forbidden);
    }
    sqlx::query("DELETE FROM class_members WHERE class_id = $1 AND student_id = $2")
        .bind(id)
        .bind(student_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct StudentCard {
    id: Uuid,
    display_name: String,
    pet: PetView,
    /// Moyenne pondérée sur 20 dans cette classe.
    average: Option<f64>,
    grade_count: usize,
    recovery_plans: Vec<RecoveryPlan>,
    quizzes_last_7_days: i64,
    last_quiz_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
struct Dashboard {
    class_id: Uuid,
    name: String,
    students: Vec<StudentCard>,
}

/// Tableau de bord du formateur : un dragon par élève, avec notes et activité.
async fn dashboard(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<Dashboard>> {
    let class = owned_class(&state, &auth, id).await?;
    let mut conn = state.db.acquire().await?;
    let today = pet::today(&mut conn).await?;

    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        display_name: String,
        #[sqlx(flatten)]
        pet: PetRow,
        quizzes_last_7_days: i64,
        last_quiz_at: Option<DateTime<Utc>>,
    }
    let rows = sqlx::query_as::<_, Row>(
        "SELECT u.id, u.display_name,
                COALESCE(p.name, 'Braise') AS name, COALESCE(p.xp, 0) AS xp,
                COALESCE(p.level, 1) AS level, COALESCE(p.streak, 0) AS streak,
                p.last_active_day, COALESCE(p.xp_on_last_active_day, 0) AS xp_on_last_active_day,
                (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at > now() - interval '7 days') AS quizzes_last_7_days,
                (SELECT MAX(a.finished_at) FROM attempts a WHERE a.user_id = u.id) AS last_quiz_at
         FROM class_members m JOIN users u ON u.id = m.student_id
         LEFT JOIN pets p ON p.user_id = u.id
         WHERE m.class_id = $1
         ORDER BY u.display_name",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;

    // Toutes les notes des membres : la moyenne porte sur la classe, les plans sur toutes les classes.
    // (élève, classe, matière, note, barème, coef, date, objectif de rattrapage)
    // Tri par date puis saisie : à date égale, l'objectif retenu est celui de la dernière note saisie.
    type GradeTuple = (Uuid, Uuid, String, f64, f64, f64, NaiveDate, Option<i32>);
    let grades: Vec<GradeTuple> = sqlx::query_as(
        "SELECT g.student_id, g.class_id, g.subject, g.value, g.max, g.coef, g.graded_on, rg.target
         FROM grades g JOIN class_members m ON m.student_id = g.student_id AND m.class_id = $1
         LEFT JOIN recovery_goals rg ON rg.grade_id = g.id
         ORDER BY g.graded_on, g.created_at",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let mut by_student: HashMap<Uuid, Vec<&GradeTuple>> = HashMap::new();
    for g in &grades {
        by_student.entry(g.0).or_default().push(g);
    }

    let students = rows
        .into_iter()
        .map(|row| {
            let list = by_student.get(&row.id).map(Vec::as_slice).unwrap_or_default();
            let in_class: Vec<_> = list.iter().filter(|g| g.1 == id).collect();
            let total_coef: f64 = in_class.iter().map(|g| g.5).sum();
            let average = (total_coef > 0.0)
                .then(|| in_class.iter().map(|g| xp::on20(g.3, g.4) * g.5).sum::<f64>() / total_coef);
            let refs: Vec<xp::GradeRef> = list
                .iter()
                .map(|g| xp::GradeRef { subject: &g.2, value: g.3, max: g.4, graded_on: g.6, target: g.7 })
                .collect();
            StudentCard {
                id: row.id,
                display_name: row.display_name,
                pet: pet::view(&row.pet, today),
                average,
                grade_count: in_class.len(),
                recovery_plans: xp::active_recovery_plans(&refs, today),
                quizzes_last_7_days: row.quizzes_last_7_days,
                last_quiz_at: row.last_quiz_at,
            }
        })
        .collect();
    Ok(Json(Dashboard { class_id: id, name: class.name, students }))
}
