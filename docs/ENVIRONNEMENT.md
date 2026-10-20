# Environnement de développement

Ce qu'il faut installer pour lancer le projet en local. Pour les commandes de lancement et d'arrêt, voir [LANCER_EN_LOCAL.md](LANCER_EN_LOCAL.md).

## Outils à installer

| Outil | Version minimale | Version testée | Sert à |
|---|---|---|---|
| [Rust](https://rustup.rs) (via rustup, avec `cargo`) | 1.88 | 1.97.0 | Compiler et lancer l'API |
| Compilateur C | toute version récente | Apple clang | Compiler certaines dépendances Rust (`ring`, pour le chiffrement) |
| [Node.js](https://nodejs.org) (avec `npm`) | 22.12 | 26.5.0 (npm 11.17) | Lancer et compiler l'application web |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (avec Docker Compose v2) | Compose v2 | Docker 29.6, Compose 5.3 | Faire tourner PostgreSQL |
| [Git](https://git-scm.com) | toute version récente | 2.55 | Récupérer le dépôt |
| [jq](https://jqlang.github.io/jq/) | 1.6 | 1.7.1 | Facultatif : seulement pour le script de test `scripts/smoke.sh` |
| `curl` | | | Facultatif : script de test (déjà présent sur macOS et Linux) |

Pourquoi ces minimums :
- **Rust 1.88** : le backend utilise l'édition 2024 (Rust 1.85 au minimum) et des `if let … &&` enchaînés, stables depuis Rust 1.88. Une version plus ancienne refuse de compiler.
- **Node 22.12** : minimum exigé par Vite 8. Node 20 ne fonctionne pas.

Il n'est **pas nécessaire** d'installer PostgreSQL : Docker le fournit. Il n'y a pas non plus d'OpenSSL à installer, car les connexions chiffrées passent par `rustls`, écrit en Rust.

### Installation selon le système

**macOS**
```sh
xcode-select --install                 # compilateur C d'Apple
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
brew install node jq                   # ou l'installateur de nodejs.org
```
Puis installer Docker Desktop et le lancer.

**Linux (Debian, Ubuntu)**
```sh
sudo apt install build-essential curl git jq
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Node.js 22 ou plus : via [nvm](https://github.com/nvm-sh/nvm) ou le dépôt NodeSource (la version des dépôts Ubuntu est souvent trop ancienne). Docker : Docker Engine et le plugin `docker compose`.

**Windows**
- Installer [rustup](https://rustup.rs). Il propose d'installer les « Build Tools for Visual Studio » (compilateur C) : accepter.
- Installer Node.js depuis nodejs.org.
- Installer Docker Desktop (avec WSL 2).
- Le script `scripts/smoke.sh` est un script bash : le lancer depuis Git Bash ou WSL.

### Vérifier l'installation

```sh
rustc --version          # 1.88 ou plus
cargo --version
node --version           # v22.12 ou plus
npm --version
docker compose version   # v2 ou plus
```

## Ports utilisés

Ces ports doivent être libres sur la machine :

| Port | Service |
|---|---|
| 5433 | PostgreSQL (dans Docker) ; 5433 et non 5432 pour ne pas gêner un PostgreSQL déjà installé |
| 3000 | API (modifiable avec `PORT` dans `backend/.env`) |
| 5174 | Application web en développement (`npm run dev`) |
| 4174 | Application web compilée (`npm run preview`) |

## Configuration

Un seul fichier à créer : `backend/.env`, à partir du modèle.

```sh
cp backend/.env.example backend/.env
```

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `DATABASE_URL` | Adresse de la base | La base Docker du projet |
| `JWT_SECRET` | Secret de signature des jetons de connexion | À remplacer par une valeur longue et aléatoire, propre à chacun |
| `PORT` | Port de l'API | `3000` |
| `DEMO_MODE` | Comptes et données de démonstration, connexion sans mot de passe | `true` (jamais en production) |

`backend/.env` n'est pas versionné (`.gitignore`) : il ne doit jamais être commité.

L'application web n'a besoin d'aucune configuration. Pour viser une autre adresse d'API, lancer `VITE_API_URL=http://… npm run dev`.

## Ce qui s'installe tout seul

Pas besoin d'installer les bibliothèques à la main : `cargo` et `npm` les téléchargent au premier lancement, aux versions fixées par `backend/Cargo.lock` et `web/package-lock.json`.

| Partie | Principales bibliothèques | Version |
|---|---|---|
| Backend | Axum (serveur web, WebSocket) | 0.8.9 |
| | Tokio (exécution asynchrone) | 1.53.2 |
| | sqlx (accès à PostgreSQL, migrations) | 0.9.0 |
| | jsonwebtoken (JWT), bcrypt (mots de passe), serde (JSON) | 9.3 / 0.19 / 1.0 |
| Base | PostgreSQL (image Docker `postgres:17`) | 17 |
| Web | React | 18.3.1 |
| | Vite (serveur de développement, compilation) | 8.3.4 |
| | TypeScript | 6.0.3 |
| | Tailwind CSS | 4.3.3 |
| | React Router, Zustand | 7.18.4 / 5.0.15 |
| | Vitest (tests), oxlint (lint) | 5.0.4 / 1.87 |

Le premier `cargo run` télécharge et compile toutes les dépendances Rust : compter quelques minutes et environ 2 Go dans `backend/target/`. Les lancements suivants prennent quelques secondes.

## Éditeur conseillé

Facultatif : VS Code avec les extensions **rust-analyzer** (Rust), **Tailwind CSS IntelliSense** et **oxc** (lint).

## Problèmes d'environnement connus

| Symptôme | Cause | Solution |
|---|---|---|
| `linking with cc failed`, `library not found for -liconv` (Mac) | Un compilateur C de Nix ou Homebrew passe devant celui d'Apple | Réglé par `backend/.cargo/config.toml` sur Mac Apple Silicon. Mac Intel : `CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER=/usr/bin/cc cargo run` |
| `error[E0658]` ou erreur sur `edition = "2024"` | Rust trop ancien | `rustup update` |
| Vite refuse de démarrer, message sur la version de Node | Node trop ancien | Installer Node 22.12 ou plus |
| `Cannot connect to the Docker daemon` | Docker Desktop n'est pas lancé | Ouvrir Docker Desktop |
| `Address already in use` | Port déjà pris | Libérer le port, ou changer `PORT` dans `backend/.env` |

Les autres problèmes de lancement sont dans [LANCER_EN_LOCAL.md](LANCER_EN_LOCAL.md#problèmes-courants).
