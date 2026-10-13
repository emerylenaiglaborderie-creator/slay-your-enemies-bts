# Lancer et arrêter le projet en local

Le projet tourne en trois morceaux, chacun dans son terminal :

| Morceau | Adresse | Lancé avec |
|---|---|---|
| Base de données PostgreSQL | `localhost:5433` | Docker |
| API (backend Rust) | http://localhost:3000 | `cargo run` |
| App web | http://localhost:5174 | `npm run dev` |

Toutes les commandes partent de la racine du dépôt (`SLAYyourENEMIES-BTS/`).

## Prérequis (une seule fois)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), lancé avant de démarrer la base
- [Rust](https://rustup.rs) (`cargo --version` doit répondre)
- [Node.js](https://nodejs.org) 20 ou plus (`node --version`)
- `jq`, seulement pour le script de test : `brew install jq`

## Première installation

```sh
cp backend/.env.example backend/.env    # configuration de l'API
cd web && npm install && cd ..          # dépendances de l'app web
```

`backend/.env` contient l'adresse de la base et le secret des jetons de connexion. Il n'est pas versionné : chacun garde le sien.

## Lancer

### 1. La base de données

```sh
docker compose up -d
```

`-d` la lance en arrière-plan : le terminal reste libre. Pour vérifier qu'elle tourne : `docker compose ps`.

### 2. L'API

Dans un nouveau terminal :

```sh
cd backend
cargo run
```

Le premier lancement compile tout et prend quelques minutes, les suivants quelques secondes. L'API est prête quand le message `API en écoute sur 0.0.0.0:3000` s'affiche. Les tables sont créées automatiquement au démarrage.

### 3. L'app web

Dans un troisième terminal :

```sh
cd web
npm run dev
```

Ouvrir http://localhost:5174.

### Mode démo (sans créer de compte)

Avec `DEMO_MODE=true` dans `backend/.env` (valeur par défaut de `.env.example`), la page de connexion propose « Essayer en élève » et « Essayer en formateur ». Au démarrage, l'API crée des données d'exemple :

- un formateur, « Formateur démo », avec la classe « BTS SIO1 – démo » (code `DEMO26`) ;
- six élèves dans cette classe : « Élève démo » (le compte du bouton « Essayer en élève »), Pierre, Emery, Hugo, Joshua et Andrei, avec des dragons à des stades différents (Emery est au stade jeune, Andrei n'a jamais joué) ;
- trois évaluations (une passée, deux à venir) et des notes, dont deux sous la moyenne pour voir les plans de rattrapage ;
- un quiz publié, « Réseaux : les bases », avec un score déjà au classement.

Les comptes de démo sont partagés : tout ce que tu y fais reste visible au prochain essai. Ne jamais activer ce mode sur le serveur de production : n'importe qui pourrait se connecter à ces comptes.

### Vérifier que l'API fonctionne

Avec l'API lancée, dans un autre terminal :

```sh
cd backend
./scripts/smoke.sh
```

Le script crée un formateur, deux étudiants, un quiz et un défi, puis vérifie chaque étape. Il doit finir par `Scénario complet : OK`.

## Arrêter

| Morceau | Comment l'arrêter |
|---|---|
| App web | `Ctrl + C` dans son terminal |
| API | `Ctrl + C` dans son terminal |
| Base de données | `docker compose down` depuis la racine du dépôt |

`docker compose down` arrête la base mais garde les données : on les retrouve au prochain `docker compose up -d`.

Si un terminal a été fermé sans `Ctrl + C` et que le port 3000 reste occupé :

```sh
pkill -f quiz-api
```

## Repartir d'une base vide

Pour effacer toutes les données (comptes, quiz, tentatives) :

```sh
docker compose down -v
docker compose up -d
```

`-v` supprime le volume où sont stockées les données. Les tables sont recréées au prochain lancement de l'API.

## Problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop n'est pas lancé | Ouvrir Docker Desktop, attendre qu'il soit prêt |
| `connexion PostgreSQL impossible` au lancement de l'API | La base n'est pas démarrée | `docker compose up -d` |
| `DATABASE_URL manquant` | Pas de fichier `.env` | `cp backend/.env.example backend/.env` |
| « Mode démo désactivé » sur la page de connexion | `DEMO_MODE` absent ou différent de `true` | Ajouter `DEMO_MODE=true` dans `backend/.env`, puis relancer l'API |
| `Address already in use` | Une ancienne API tourne encore | `pkill -f quiz-api` |
| `linking with cc failed` / `library not found for -liconv` (Mac) | Un `cc` de Nix ou Homebrew passe devant celui d'Apple | Déjà réglé par `backend/.cargo/config.toml` sur Mac Apple Silicon. Sur un Mac Intel : `CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER=/usr/bin/cc cargo run` |
