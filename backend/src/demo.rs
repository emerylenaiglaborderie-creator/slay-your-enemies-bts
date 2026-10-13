//! Mode démo : comptes, quiz et classe d'exemple, connexion sans mot de passe.
//! Activé par `DEMO_MODE=true` ; à ne jamais activer en production.

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::issue_token,
    models::user::{User, UserRole},
    AppState,
};

const TRAINER_EMAIL: &str = "formateur@demo.local";
const STUDENT_EMAIL: &str = "eleve@demo.local";
const RIVAL_EMAIL: &str = "pierre@demo.local";

/// Élèves d'exemple de la classe de démo, en plus d'« Élève démo ».
/// (email, nom, XP, série, jours depuis la dernière activité, note sur 20 en Réseau)
type DemoStudent = (&'static str, &'static str, i32, i32, i64, Option<f64>);
const CLASSMATES: [DemoStudent; 5] = [
    (RIVAL_EMAIL, "Pierre", 150, 4, 0, Some(8.0)),
    ("emery@demo.local", "Emery", 820, 12, 0, Some(18.5)),
    ("hugo@demo.local", "Hugo", 240, 2, 3, Some(11.0)),
    ("joshua@demo.local", "Joshua", 60, 0, 9, Some(6.5)),
    ("andrei@demo.local", "Andrei", 0, 0, 30, None),
];

/// Anciens comptes de démo renommés : une base déjà remplie garde ses données.
const RENAMED: [(&str, &str); 4] = [
    ("rival@demo.local", RIVAL_EMAIL),
    ("ines@demo.local", "emery@demo.local"),
    ("lea@demo.local", "joshua@demo.local"),
    ("malik@demo.local", "andrei@demo.local"),
];
const DEMO_QUIZ_TITLE: &str = "Réseaux : les bases";

/// Type, énoncé, explication, réponses (libellé, juste ?).
type DemoQuestion = (&'static str, &'static str, &'static str, &'static [(&'static str, bool)]);

pub fn router() -> Router<AppState> {
    Router::new().route("/auth/demo", post(demo_login))
}

async fn upsert_user(db: &PgPool, email: &str, name: &str, role: UserRole) -> sqlx::Result<Uuid> {
    // Mot de passe aléatoire jamais communiqué : ces comptes ne s'ouvrent que par /auth/demo.
    let hash = bcrypt::hash(Uuid::new_v4().to_string(), 4).expect("hachage bcrypt");
    sqlx::query_scalar(
        "INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id",
    )
    .bind(email)
    .bind(hash)
    .bind(name)
    .bind(role)
    .fetch_one(db)
    .await
}

/// Crée les comptes de démo et le quiz d'exemple s'ils n'existent pas encore.
pub async fn seed(db: &PgPool) -> sqlx::Result<()> {
    for (old, new) in RENAMED {
        sqlx::query("UPDATE users SET email = $2 WHERE email = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2)")
            .bind(old)
            .bind(new)
            .execute(db)
            .await?;
    }
    let trainer = upsert_user(db, TRAINER_EMAIL, "Formateur démo", UserRole::Trainer).await?;
    upsert_user(db, STUDENT_EMAIL, "Élève démo", UserRole::Student).await?;
    // Les noms sont remis à jour à chaque démarrage.
    for (email, name, ..) in CLASSMATES {
        upsert_user(db, email, name, UserRole::Student).await?;
    }
    let rival = upsert_user(db, RIVAL_EMAIL, "Pierre", UserRole::Student).await?;
    seed_class(db, trainer).await?;

    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM quizzes WHERE author_id = $1 AND title = $2)")
        .bind(trainer)
        .bind(DEMO_QUIZ_TITLE)
        .fetch_one(db)
        .await?;
    if exists {
        return Ok(());
    }

    let mut tx = db.begin().await?;
    let quiz: Uuid = sqlx::query_scalar(
        "INSERT INTO quizzes (author_id, title, description, theme, difficulty, seconds_per_question, is_published)
         VALUES ($1, $2, 'Quiz d''exemple du mode démo.', 'Réseau', 'easy', 30, true) RETURNING id",
    )
    .bind(trainer)
    .bind(DEMO_QUIZ_TITLE)
    .fetch_one(&mut *tx)
    .await?;

    let questions: [DemoQuestion; 4] = [
        ("mcq", "Quel est le port par défaut de HTTPS ?", "HTTP utilise 80, HTTPS 443.", &[("21", false), ("80", false), ("443", true), ("8080", false)]),
        ("true_false", "TCP est un protocole orienté connexion.", "TCP établit une connexion (poignée de main en 3 temps), UDP non.", &[("Vrai", true), ("Faux", false)]),
        ("mcq", "À quelle couche du modèle OSI se situe le routage IP ?", "Le routage se fait en couche 3, réseau.", &[("Liaison", false), ("Réseau", true), ("Transport", false), ("Application", false)]),
        ("free_text", "Que signifie l'acronyme DNS ?", "Le DNS traduit les noms de domaine en adresses IP.", &[("Domain Name System", true)]),
    ];
    for (position, (kind, statement, explanation, answers)) in questions.iter().enumerate() {
        let question: Uuid = sqlx::query_scalar(
            "INSERT INTO questions (quiz_id, type, statement, explanation, points, position)
             VALUES ($1, $2::question_type, $3, $4, 1, $5) RETURNING id",
        )
        .bind(quiz)
        .bind(kind)
        .bind(statement)
        .bind(explanation)
        .bind(position as i32 + 1)
        .fetch_one(&mut *tx)
        .await?;
        for (label, correct) in answers.iter() {
            sqlx::query("INSERT INTO answers (question_id, label, is_correct) VALUES ($1, $2, $3)")
                .bind(question)
                .bind(label)
                .bind(correct)
                .execute(&mut *tx)
                .await?;
        }
    }

    // Une tentative du rival pour que le classement ne soit pas vide.
    sqlx::query(
        "INSERT INTO attempts (user_id, quiz_id, started_at, finished_at, score, total_time_ms)
         VALUES ($1, $2, now() - interval '5 minutes', now() - interval '4 minutes', 2, 41000)",
    )
    .bind(rival)
    .bind(quiz)
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

const DEMO_CLASS_CODE: &str = "DEMO26";

/// Classe d'exemple : des élèves à des stades différents, des évaluations et des notes,
/// pour que le tableau de bord du formateur ait quelque chose à montrer.
async fn seed_class(db: &PgPool, trainer: Uuid) -> sqlx::Result<()> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM classes WHERE join_code = $1)")
        .bind(DEMO_CLASS_CODE)
        .fetch_one(db)
        .await?;
    if exists {
        return Ok(());
    }
    let students = std::iter::once((STUDENT_EMAIL, "Élève démo", 35, 1, 1, Some(15.0))).chain(CLASSMATES);

    let mut tx = db.begin().await?;
    let class: Uuid = sqlx::query_scalar("INSERT INTO classes (trainer_id, name, join_code) VALUES ($1, 'BTS SIO1 – démo', $2) RETURNING id")
        .bind(trainer)
        .bind(DEMO_CLASS_CODE)
        .fetch_one(&mut *tx)
        .await?;
    let today = crate::routes::pet::today(&mut tx).await?;
    let past: Uuid = sqlx::query_scalar(
        "INSERT INTO evaluations (class_id, title, type, theme, date) VALUES ($1, 'Contrôle modèle OSI', 'controle', 'Réseau', $2) RETURNING id",
    )
    .bind(class)
    .bind(today - chrono::Duration::days(3))
    .fetch_one(&mut *tx)
    .await?;
    for (title, kind, theme, days) in [("Examen blanc Réseau", "examen", "Réseau", 12), ("Projet site vitrine", "projet", "Web", 30)] {
        sqlx::query("INSERT INTO evaluations (class_id, title, type, theme, date) VALUES ($1, $2, $3::evaluation_type, $4, $5)")
            .bind(class)
            .bind(title)
            .bind(kind)
            .bind(theme)
            .bind(today + chrono::Duration::days(days))
            .execute(&mut *tx)
            .await?;
    }

    for (email, name, xp, streak, idle_days, grade) in students {
        let id = upsert_user(db, email, name, UserRole::Student).await?;
        sqlx::query("INSERT INTO class_members (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
            .bind(class)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        let last_active = (xp > 0).then(|| today - chrono::Duration::days(idle_days));
        sqlx::query(
            "INSERT INTO pets (user_id, xp, level, streak, last_active_day) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level,
                 streak = EXCLUDED.streak, last_active_day = EXCLUDED.last_active_day",
        )
        .bind(id)
        .bind(xp)
        .bind(crate::xp::level_for_xp(xp))
        .bind(streak)
        .bind(last_active)
        .execute(&mut *tx)
        .await?;
        if let Some(value) = grade {
            sqlx::query(
                "INSERT INTO grades (class_id, student_id, evaluation_id, subject, value, max, coef, graded_on)
                 VALUES ($1, $2, $3, 'Réseau', $4, 20, 2, $5)",
            )
            .bind(class)
            .bind(id)
            .bind(past)
            .bind(value)
            .bind(today - chrono::Duration::days(2))
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await
}

#[derive(Deserialize)]
struct DemoBody {
    role: UserRole,
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
    user: User,
}

async fn demo_login(State(state): State<AppState>, Json(body): Json<DemoBody>) -> AppResult<Json<AuthResponse>> {
    let email = match body.role {
        UserRole::Trainer => TRAINER_EMAIL,
        UserRole::Student => STUDENT_EMAIL,
    };
    let user = sqlx::query_as::<_, User>("SELECT id, email, display_name, role, created_at FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let token = issue_token(&state.jwt_secret, user.id, user.role);
    Ok(Json(AuthResponse { token, user }))
}
