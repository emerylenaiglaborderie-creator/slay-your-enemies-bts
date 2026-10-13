use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "challenge_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ChallengeStatus {
    Pending,
    Accepted,
    Declined,
    Completed,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Challenge {
    pub id: Uuid,
    pub quiz_id: Uuid,
    pub challenger_id: Uuid,
    pub challenged_id: Uuid,
    pub status: ChallengeStatus,
    pub created_at: DateTime<Utc>,
}
