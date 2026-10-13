mod db;
mod demo;
mod error;
mod middleware;
mod models;
mod routes;
mod ws;
mod xp;

use std::net::SocketAddr;

use axum::Router;
use sqlx::PgPool;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
    pub hub: ws::Hub,
}

pub fn app(state: AppState, demo_mode: bool) -> Router {
    let router = if demo_mode { demo::router() } else { Router::new() };
    router
        .merge(routes::auth::router())
        .merge(routes::quizzes::router())
        .merge(routes::attempts::router())
        .merge(routes::leaderboard::router())
        .merge(routes::challenges::router())
        .merge(routes::classes::router())
        .merge(routes::evaluations::router())
        .merge(routes::grades::router())
        .merge(routes::pet::router())
        .merge(ws::router())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL manquant");
    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET manquant");
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);

    let demo_mode = std::env::var("DEMO_MODE").is_ok_and(|v| v == "true");

    let db = db::connect(&database_url).await;
    if demo_mode {
        demo::seed(&db).await.expect("création des données de démo");
        tracing::warn!("mode démo actif : connexion sans mot de passe aux comptes de démo");
    }
    let state = AppState { db, jwt_secret, hub: ws::Hub::new() };

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::info!("API en écoute sur {addr}");
    axum::serve(listener, app(state, demo_mode)).await.unwrap();
}
