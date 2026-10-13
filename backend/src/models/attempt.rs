use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Attempt {
    pub id: Uuid,
    pub user_id: Uuid,
    pub quiz_id: Uuid,
    pub challenge_id: Option<Uuid>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub score: Option<i32>,
    pub total_time_ms: Option<i32>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AttemptAnswer {
    pub id: Uuid,
    pub attempt_id: Uuid,
    pub question_id: Uuid,
    pub answer_id: Option<Uuid>,
    pub free_text: Option<String>,
    pub is_correct: Option<bool>,
    pub time_ms: i32,
}
