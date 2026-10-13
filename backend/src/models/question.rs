use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "question_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    Mcq,
    TrueFalse,
    FreeText,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Question {
    pub id: Uuid,
    pub quiz_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub kind: QuestionType,
    pub statement: String,
    pub explanation: Option<String>,
    pub image_url: Option<String>,
    pub points: i32,
    pub position: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Answer {
    pub id: Uuid,
    pub question_id: Uuid,
    pub label: String,
    /// Masqué aux étudiants avant la fin de leur tentative.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_correct: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct QuestionWithAnswers {
    #[serde(flatten)]
    pub question: Question,
    pub answers: Vec<Answer>,
}
