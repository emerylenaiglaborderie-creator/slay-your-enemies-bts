use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "difficulty_level", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Quiz {
    pub id: Uuid,
    pub author_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub theme: String,
    pub difficulty: Difficulty,
    pub seconds_per_question: i32,
    pub is_published: bool,
    pub created_at: DateTime<Utc>,
}
