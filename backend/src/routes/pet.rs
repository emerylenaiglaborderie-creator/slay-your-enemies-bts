//! Dragon de l'élève : XP gagnée en quiz, défis et notes (voir `xp.rs` pour les règles).

use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::user::UserRole,
    xp::{self, PetState, RecoveryPlan, Reward},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/me/pet", get(my_pet).patch(rename))
}

/// Date du jour en France : c'est elle qui découpe les séries et le plafond quotidien.
pub async fn today(conn: &mut PgConnection) -> sqlx::Result<NaiveDate> {
    sqlx::query_scalar("SELECT (now() AT TIME ZONE 'Europe/Paris')::date").fetch_one(conn).await
}

#[derive(Debug, sqlx::FromRow)]
pub struct PetRow {
    pub name: String,
    pub xp: i32,
    pub level: i32,
    pub streak: i32,
    pub last_active_day: Option<NaiveDate>,
    pub xp_on_last_active_day: i32,
}

impl PetRow {
    fn state(&self) -> PetState {
        PetState {
            xp: self.xp,
            level: self.level,
            streak: self.streak,
            last_active_day: self.last_active_day,
            xp_on_last_active_day: self.xp_on_last_active_day,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct NextStage {
    id: &'static str,
    min_level: i32,
}

/// Dragon tel qu'affiché à l'élève et au formateur.
#[derive(Debug, Serialize)]
pub struct PetView {
    pub name: String,
    pub xp: i32,
    pub level: i32,
    pub stage: &'static str,
    pub xp_in_level: i32,
    pub xp_needed: i32,
    pub streak: i32,
    pub earned_today: i32,
    pub daily_cap: i32,
    pub last_active_day: Option<NaiveDate>,
    pub next_stage: Option<NextStage>,
}

pub fn view(row: &PetRow, today: NaiveDate) -> PetView {
    let state = row.state();
    let (xp_in_level, xp_needed) = xp::level_progress(row.xp);
    let stage = xp::stage_for_level(row.level);
    PetView {
        name: row.name.clone(),
        xp: row.xp,
        level: row.level,
        stage: xp::STAGE_IDS[stage],
        xp_in_level,
        xp_needed,
        streak: xp::current_streak(&state, today),
        earned_today: xp::earned_today(&state, today),
        daily_cap: xp::DAILY_CAP,
        last_active_day: row.last_active_day,
        next_stage: xp::STAGE_IDS
            .get(stage + 1)
            .map(|id| NextStage { id, min_level: xp::STAGE_MIN_LEVELS[stage + 1] }),
    }
}


/// Charge le dragon (créé au premier accès) et le verrouille jusqu'à la fin de la transaction.
async fn load_for_update(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<PetRow> {
    sqlx::query("INSERT INTO pets (user_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(user_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query_as::<_, PetRow>(
        "SELECT name, xp, level, streak, last_active_day, xp_on_last_active_day
         FROM pets WHERE user_id = $1 FOR UPDATE",
    )
    .bind(user_id)
    .fetch_one(conn)
    .await
}

async fn save(conn: &mut PgConnection, user_id: Uuid, s: &PetState) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE pets SET xp = $2, level = $3, streak = $4, last_active_day = $5, xp_on_last_active_day = $6
         WHERE user_id = $1",
    )
    .bind(user_id)
    .bind(s.xp)
    .bind(s.level)
    .bind(s.streak)
    .bind(s.last_active_day)
    .bind(s.xp_on_last_active_day)
    .execute(conn)
    .await?;
    Ok(())
}

async fn log_event(conn: &mut PgConnection, user_id: Uuid, amount: i32, reason: &str, ref_id: Uuid) -> sqlx::Result<()> {
    if amount > 0 {
        sqlx::query("INSERT INTO xp_events (user_id, amount, reason, ref_id) VALUES ($1, $2, $3, $4)")
            .bind(user_id)
            .bind(amount)
            .bind(reason)
            .bind(ref_id)
            .execute(conn)
            .await?;
    }
    Ok(())
}

/// Plans de rattrapage en cours d'un élève, toutes classes confondues.
pub async fn recovery_plans(conn: &mut PgConnection, student_id: Uuid, today: NaiveDate) -> sqlx::Result<Vec<RecoveryPlan>> {
    // Tri par date puis saisie : à date égale, l'objectif retenu est celui de la dernière note saisie.
    let rows: Vec<(String, f64, f64, NaiveDate, Option<i32>)> = sqlx::query_as(
        "SELECT g.subject, g.value, g.max, g.graded_on, rg.target
         FROM grades g LEFT JOIN recovery_goals rg ON rg.grade_id = g.id
         WHERE g.student_id = $1
         ORDER BY g.graded_on, g.created_at",
    )
    .bind(student_id)
    .fetch_all(conn)
    .await?;
    let grades: Vec<xp::GradeRef> = rows
        .iter()
        .map(|(subject, value, max, graded_on, target)| xp::GradeRef {
            subject,
            value: *value,
            max: *max,
            graded_on: *graded_on,
            target: *target,
        })
        .collect();
    Ok(xp::active_recovery_plans(&grades, today))
}

/// Récompense d'un quiz terminé par un élève. Aucune XP sans réponse.
pub async fn award_quiz(state: &AppState, user_id: Uuid, attempt_id: Uuid, quiz_theme: &str) -> AppResult<Option<Reward>> {
    let mut tx = state.db.begin().await?;
    let (answered, correct, mastered): (i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                COUNT(*) FILTER (WHERE aa.is_correct),
                COUNT(*) FILTER (WHERE aa.is_correct AND EXISTS (
                    SELECT 1 FROM attempt_answers p JOIN attempts pa ON pa.id = p.attempt_id
                    WHERE pa.user_id = $2 AND pa.id <> $1 AND p.question_id = aa.question_id AND p.is_correct = false))
         FROM attempt_answers aa WHERE aa.attempt_id = $1",
    )
    .bind(attempt_id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    if answered == 0 {
        return Ok(None);
    }
    let today = today(&mut tx).await?;
    let plans = recovery_plans(&mut tx, user_id, today).await?;
    let recovery_correct = if xp::theme_in_recovery(quiz_theme, &plans) { correct as i32 } else { 0 };

    let pet = load_for_update(&mut tx, user_id).await?;
    let (next, reward) = xp::apply_quiz(pet.state(), mastered as i32, recovery_correct, today);
    save(&mut tx, user_id, &next).await?;
    log_event(&mut tx, user_id, reward.gained, "quiz", attempt_id).await?;
    tx.commit().await?;
    Ok(Some(reward))
}

/// Bonus ponctuel (bonne note, défi gagné), réservé aux élèves.
pub async fn award_bonus(conn: &mut PgConnection, user_id: Uuid, amount: i32, reason: &str, ref_id: Uuid) -> AppResult<()> {
    let role: UserRole = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&mut *conn)
        .await?;
    if role != UserRole::Student {
        return Ok(());
    }
    let pet = load_for_update(conn, user_id).await?;
    save(conn, user_id, &xp::apply_bonus(pet.state(), amount)).await?;
    log_event(conn, user_id, amount, reason, ref_id).await?;
    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
struct XpEvent {
    amount: i32,
    reason: String,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
struct Rules {
    quiz_base: i32,
    mastery_bonus: i32,
    daily_cap: i32,
    streak_max_bonus_pct: i32,
    challenge_win_bonus: i32,
    good_grade_bonus: i32,
    good_grade_threshold: f64,
    bad_grade_threshold: f64,
    recovery_bonus_per_answer: i32,
    recovery_bonus_max: i32,
}

#[derive(Serialize)]
struct MyPet {
    pet: PetView,
    recovery_plans: Vec<RecoveryPlan>,
    recent_events: Vec<XpEvent>,
    rules: Rules,
}

async fn my_pet(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<MyPet>> {
    if auth.role != UserRole::Student {
        return Err(AppError::Forbidden);
    }
    let mut tx = state.db.begin().await?;
    let row = load_for_update(&mut tx, auth.id).await?;
    let today = today(&mut tx).await?;
    let recovery_plans = recovery_plans(&mut tx, auth.id, today).await?;
    let recent_events = sqlx::query_as::<_, XpEvent>(
        "SELECT amount, reason, created_at FROM xp_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
    )
    .bind(auth.id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(MyPet {
        pet: view(&row, today),
        recovery_plans,
        recent_events,
        rules: Rules {
            quiz_base: xp::QUIZ_BASE,
            mastery_bonus: xp::MASTERY_BONUS,
            daily_cap: xp::DAILY_CAP,
            streak_max_bonus_pct: (xp::STREAK_MAX_BONUS * 100.0) as i32,
            challenge_win_bonus: xp::CHALLENGE_WIN_BONUS,
            good_grade_bonus: xp::GOOD_GRADE_BONUS,
            good_grade_threshold: xp::GOOD_GRADE_THRESHOLD,
            bad_grade_threshold: xp::BAD_GRADE_THRESHOLD,
            recovery_bonus_per_answer: xp::RECOVERY_BONUS_PER_ANSWER,
            recovery_bonus_max: xp::RECOVERY_BONUS_MAX,
        },
    }))
}

#[derive(Deserialize)]
struct RenameBody {
    name: String,
}

async fn rename(State(state): State<AppState>, auth: AuthUser, Json(body): Json<RenameBody>) -> AppResult<Json<PetView>> {
    if auth.role != UserRole::Student {
        return Err(AppError::Forbidden);
    }
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 24 {
        return Err(AppError::BadRequest("nom du dragon : 1 à 24 caractères".into()));
    }
    let mut tx = state.db.begin().await?;
    let mut row = load_for_update(&mut tx, auth.id).await?;
    sqlx::query("UPDATE pets SET name = $2 WHERE user_id = $1").bind(auth.id).bind(name).execute(&mut *tx).await?;
    let today = today(&mut tx).await?;
    tx.commit().await?;
    row.name = name.to_string();
    Ok(Json(view(&row, today)))
}
