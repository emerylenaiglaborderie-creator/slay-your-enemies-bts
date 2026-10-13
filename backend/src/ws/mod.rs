//! Temps réel (T-004) : un endpoint `/ws?token=<jwt>` et des rooms.
//!
//! Le client envoie `{"type":"subscribe","room":"quiz:<id>"}` (ou `unsubscribe`).
//! Rooms : `quiz:{id}` (classement), `challenge:{id}` (participants), `user:{id}` (soi-même).

use std::{collections::HashSet, sync::Arc};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    error::AppResult,
    middleware::auth::{verify_token, AuthUser},
    routes::{challenges, quizzes},
    AppState,
};

#[derive(Clone)]
pub struct Hub {
    tx: broadcast::Sender<Arc<(String, String)>>,
}

impl Hub {
    pub fn new() -> Self {
        Self { tx: broadcast::channel(256).0 }
    }

    /// Diffuse un message à tous les clients abonnés à `room`.
    pub fn publish(&self, room: &str, message: Value) {
        // Une erreur signifie seulement qu'aucun client n'est connecté.
        let _ = self.tx.send(Arc::new((room.to_string(), message.to_string())));
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(upgrade))
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

async fn upgrade(ws: WebSocketUpgrade, State(state): State<AppState>, Query(q): Query<WsQuery>) -> AppResult<Response> {
    let auth = verify_token(&state.jwt_secret, &q.token)?;
    Ok(ws.on_upgrade(move |socket| handle(socket, state, auth)))
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Subscribe { room: String },
    Unsubscribe { room: String },
}

/// Vérifie qu'un utilisateur a le droit d'écouter une room.
async fn can_join(state: &AppState, auth: &AuthUser, room: &str) -> bool {
    let Some((kind, id)) = room.split_once(':') else { return false };
    let Ok(id) = id.parse::<Uuid>() else { return false };
    match kind {
        "quiz" => quizzes::visible_quiz(state, auth, id).await.is_ok(),
        "challenge" => challenges::participant_challenge(state, auth, id).await.is_ok(),
        "user" => id == auth.id,
        _ => false,
    }
}

async fn handle(mut socket: WebSocket, state: AppState, auth: AuthUser) {
    let mut rx = state.hub.tx.subscribe();
    let mut rooms: HashSet<String> = HashSet::new();

    loop {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(Ok(msg)) = incoming else { break };
                let Message::Text(text) = msg else { continue };
                let reply = match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(ClientMessage::Subscribe { room }) => {
                        if can_join(&state, &auth, &room).await {
                            rooms.insert(room.clone());
                            json!({ "type": "subscribed", "room": room })
                        } else {
                            json!({ "type": "error", "error": "room inaccessible", "room": room })
                        }
                    }
                    Ok(ClientMessage::Unsubscribe { room }) => {
                        rooms.remove(&room);
                        json!({ "type": "unsubscribed", "room": room })
                    }
                    Err(_) => json!({ "type": "error", "error": "message invalide" }),
                };
                if socket.send(Message::Text(reply.to_string().into())).await.is_err() {
                    break;
                }
            }
            event = rx.recv() => {
                match event {
                    Ok(event) => {
                        let (room, payload) = &*event;
                        if rooms.contains(room) && socket.send(Message::Text(payload.clone().into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}
