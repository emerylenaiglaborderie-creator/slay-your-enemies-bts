# Plateforme de quiz interactifs (projet BTS SIO)

Projet scolaire, scénario TechLearn Solutions (CDD-QUIZ-2026-001), réalisé en binôme à partir de l'app perso « Slay your enemies ».

- Suivi du cahier des charges et de la roadmap : [docs/ALIGNEMENT.md](docs/ALIGNEMENT.md)
- Documentation de l'API : [docs/API.md](docs/API.md)

| Dossier | Stack |
|---|---|
| `backend/` | Rust, Axum, sqlx, PostgreSQL, WebSocket |
| `web/` | React, TypeScript, Vite, Tailwind, branché sur l'API |
| `mobile/` | React Native + TypeScript (à venir) |

## Lancer en local

Guide détaillé (arrêt, remise à zéro, problèmes courants) : [docs/LANCER_EN_LOCAL.md](docs/LANCER_EN_LOCAL.md).

```sh
docker compose up -d                     # PostgreSQL sur le port 5433
cd backend && cp .env.example .env
cargo run                                # API sur http://localhost:3000, migrations appliquées au démarrage
./scripts/smoke.sh                       # scénario de bout en bout (curl + jq)

cd web && npm install && npm run dev     # http://localhost:5174
```

