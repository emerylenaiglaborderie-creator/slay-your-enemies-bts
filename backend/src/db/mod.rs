use sqlx::{postgres::PgPoolOptions, PgPool};

/// Ouvre le pool et applique les migrations de `migrations/`.
pub async fn connect(url: &str) -> PgPool {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(url)
        .await
        .expect("connexion PostgreSQL impossible");
    sqlx::migrate!().run(&pool).await.expect("échec des migrations");
    pool
}
