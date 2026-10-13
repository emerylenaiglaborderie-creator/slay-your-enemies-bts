use axum::{extract::State, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    middleware::auth::{issue_token, AuthUser},
    models::user::{User, UserRole},
    AppState,
};

const MIN_PASSWORD_LEN: usize = 8;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/me", get(me))
}

#[derive(Deserialize)]
struct RegisterBody {
    email: String,
    password: String,
    display_name: String,
    role: UserRole,
}

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
    user: User,
}

async fn register(State(state): State<AppState>, Json(body): Json<RegisterBody>) -> AppResult<Json<AuthResponse>> {
    let email = body.email.trim().to_lowercase();
    let display_name = body.display_name.trim();
    if !email.contains('@') || email.len() > 254 {
        return Err(AppError::BadRequest("email invalide".into()));
    }
    if body.password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::BadRequest(format!("mot de passe : {MIN_PASSWORD_LEN} caractères minimum")));
    }
    if display_name.is_empty() {
        return Err(AppError::BadRequest("nom affiché requis".into()));
    }

    let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).expect("hachage bcrypt");
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, display_name, role, created_at",
    )
    .bind(&email)
    .bind(&hash)
    .bind(display_name)
    .bind(body.role)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Conflict("email déjà utilisé".into()))?;

    let token = issue_token(&state.jwt_secret, user.id, user.role);
    Ok(Json(AuthResponse { token, user }))
}

async fn login(State(state): State<AppState>, Json(body): Json<LoginBody>) -> AppResult<Json<AuthResponse>> {
    #[derive(sqlx::FromRow)]
    struct Row {
        #[sqlx(flatten)]
        user: User,
        password_hash: String,
    }
    let row = sqlx::query_as::<_, Row>(
        "SELECT id, email, display_name, role, created_at, password_hash FROM users WHERE email = $1",
    )
    .bind(body.email.trim().to_lowercase())
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if !bcrypt::verify(&body.password, &row.password_hash).unwrap_or(false) {
        return Err(AppError::Unauthorized);
    }
    let token = issue_token(&state.jwt_secret, row.user.id, row.user.role);
    Ok(Json(AuthResponse { token, user: row.user }))
}

async fn me(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<User>> {
    let user = sqlx::query_as::<_, User>("SELECT id, email, display_name, role, created_at FROM users WHERE id = $1")
        .bind(auth.id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(user))
}
