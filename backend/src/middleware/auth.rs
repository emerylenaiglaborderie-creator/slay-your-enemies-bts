use axum::{extract::FromRequestParts, http::request::Parts};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::AppError, models::user::UserRole, AppState};

const TOKEN_TTL_SECS: i64 = 60 * 60 * 24 * 7;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: Uuid,
    role: UserRole,
    exp: i64,
}

pub fn issue_token(secret: &str, user_id: Uuid, role: UserRole) -> String {
    let claims = Claims { sub: user_id, role, exp: Utc::now().timestamp() + TOKEN_TTL_SECS };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .expect("signature JWT")
}

pub fn verify_token(secret: &str, token: &str) -> Result<AuthUser, AppError> {
    let data = decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::default())
        .map_err(|_| AppError::Unauthorized)?;
    Ok(AuthUser { id: data.claims.sub, role: data.claims.role })
}

/// Utilisateur authentifié, extrait de l'en-tête `Authorization: Bearer <jwt>`.
#[derive(Debug, Clone, Copy)]
pub struct AuthUser {
    pub id: Uuid,
    pub role: UserRole,
}

impl AuthUser {
    pub fn require_trainer(&self) -> Result<(), AppError> {
        if self.role == UserRole::Trainer { Ok(()) } else { Err(AppError::Forbidden) }
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        verify_token(&state.jwt_secret, token)
    }
}
