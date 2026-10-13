# Documentation de l'API

API REST + WebSocket du projet (Rust / Axum / PostgreSQL). Base locale : `http://localhost:3000`.

- Format : JSON. Identifiants : UUID. Dates : ISO 8601 (UTC).
- Authentification : `Authorization: Bearer <jwt>` sur toutes les routes sauf `/auth/*`. Jeton valable 7 jours.
- Erreurs : `{ "error": "message" }` avec le code HTTP adapté (400 validation, 401 non authentifié, 403 rôle insuffisant, 404 introuvable ou non visible, 409 conflit).
- Rôles : `student`, `trainer`. Les routes marquées **F** sont réservées au formateur auteur du quiz.

## Authentification (T-001)

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password (8 car. min), display_name, role }` | `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/me` | | `user` |
| POST | `/auth/demo` | `{ role }` | `{ token, user }` — seulement si `DEMO_MODE=true` (404 sinon) |

Mots de passe hachés avec bcrypt, jamais renvoyés.

## Quiz (F-001, F-003, E-001)

| Méthode | Route | Détail |
|---|---|---|
| GET | `/quizzes?theme=&difficulty=&author_id=` | Quiz publiés + ses propres brouillons. Filtres optionnels. |
| POST | `/quizzes` **F** | `{ title, description?, theme, difficulty: easy\|medium\|hard, seconds_per_question (5-600), is_published? }` → 201 |
| GET | `/quizzes/{id}` | Quiz + questions + réponses. Pour un étudiant : `is_correct` masqué et réponse attendue des textes libres retirée. |
| PATCH | `/quizzes/{id}` **F** | Même corps que la création (remplacement complet). |
| DELETE | `/quizzes/{id}` **F** | Supprime en cascade questions, tentatives, défis. 204 |

## Questions (F-002)

| Méthode | Route | Détail |
|---|---|---|
| POST | `/quizzes/{id}/questions` **F** | Voir corps ci-dessous. Position auto en fin de quiz si absente. 201 |
| PUT | `/questions/{id}` **F** | Remplace la question et toutes ses réponses. 204 |
| DELETE | `/questions/{id}` **F** | 204 |

```json
{
  "type": "mcq",
  "statement": "Port par défaut de HTTPS ?",
  "explanation": "Affichée après la réponse",
  "image_url": null,
  "points": 2,
  "position": 1,
  "answers": [{ "label": "80", "is_correct": false }, { "label": "443", "is_correct": true }]
}
```

Règles : `mcq` = au moins 2 réponses dont une correcte ; `true_false` = exactement 2 réponses dont une correcte ; `free_text` = 0 ou 1 réponse (la réponse attendue, indicative pour le formateur).

## Tentatives (E-002, E-003, E-006, F-007)

| Méthode | Route | Détail |
|---|---|---|
| POST | `/attempts` | `{ quiz_id, challenge_id? }` → tentative. Avec un défi : il doit être `accepted`, un seul passage par participant. |
| POST | `/attempts/{id}/answers` | `{ question_id, answer_id?, free_text?, time_ms }` → `{ is_correct, timed_out, correct_answer_id, explanation }` |
| POST | `/attempts/{id}/finish` | Calcule `score` (somme des points justes) et `total_time_ms`, diffuse le classement. Pour un élève, ajoute `reward` : XP gagnée par le dragon (`gained`, `base`, `mastered`, `recovery`, `multiplier`, `capped`, `levels_gained`, `stage_changed`). |
| GET | `/attempts/{id}/results` | Corrigé complet (étudiant concerné ou formateur auteur), après la fin. |
| GET | `/me/attempts` | Historique : quiz, score, score max, temps. |

Correction automatique : QCM et Vrai/Faux corrigés immédiatement. Texte libre : `is_correct = null` jusqu'à la correction du formateur. Timer : une réponse avec `time_ms` supérieur au temps du quiz (+1 s de marge) est fausse ; une question passée (`answer_id` absent) aussi. Une seule réponse par question (409 sinon).

## Suivi formateur (F-005, F-007)

| Méthode | Route | Détail |
|---|---|---|
| GET | `/quizzes/{id}/stats` **F** | `questions` : nb de réponses, nb d'échecs, temps moyen (triées de la plus échouée à la moins échouée). `students` : nb de tentatives, meilleur score, score moyen. |
| GET | `/quizzes/{id}/pending-answers` **F** | Réponses en texte libre à corriger, avec la réponse attendue. |
| PATCH | `/attempt-answers/{id}/grade` **F** | `{ is_correct }` → recalcule le score et rediffuse le classement. 204 |

## Classement (E-005)

| Méthode | Route | Détail |
|---|---|---|
| GET | `/quizzes/{id}/leaderboard` | 50 premiers : meilleure tentative de chaque utilisateur, score décroissant puis temps croissant. |

## Défis (F-008, E-007)

| Méthode | Route | Détail |
|---|---|---|
| POST | `/challenges` | `{ quiz_id, challenged_id }` → défi `pending` |
| GET | `/challenges` | Défis envoyés et reçus, avec scores des deux participants. |
| GET | `/challenges/{id}` | Détail (participants uniquement). |
| PATCH | `/challenges/{id}` | Le défié répond : `{ status: "accepted" \| "declined" }` |

Le défi passe automatiquement à `completed` quand les deux participants ont terminé leur tentative.

## Classes

| Méthode | Route | Détail |
|---|---|---|
| POST | `/classes` **F** | `{ name }` → classe avec son `join_code` (6 caractères) |
| GET | `/classes` | Classes du formateur, ou classes rejointes par l'élève : `{ id, name, trainer_name, join_code (formateur seulement), member_count }` |
| POST | `/classes/join` | Élève : `{ code }` (insensible à la casse) |
| GET | `/classes/{id}` | Formateur ou membre : `{ id, name, join_code, members: [{ id, display_name }] }` |
| DELETE | `/classes/{id}` **F** | Supprime la classe, ses évaluations et ses notes |
| DELETE | `/classes/{id}/members/{student_id}` | Le formateur retire un élève, ou l'élève quitte la classe |
| GET | `/classes/{id}/dashboard` **F** | Suivi : pour chaque élève, `pet` (voir Dragon), `average` (sur 20, dans la classe), `grade_count`, `recovery_plans`, `quizzes_last_7_days`, `last_quiz_at` |

**F** ici : formateur de la classe.

## Évaluations

| Méthode | Route | Détail |
|---|---|---|
| POST | `/classes/{id}/evaluations` **F** | `{ title, type: controle\|examen\|projet, theme?, date: "AAAA-MM-JJ" }` |
| GET | `/evaluations` | Évaluations des classes du formateur ou de l'élève, triées par date, avec `class_name` |
| DELETE | `/evaluations/{id}` **F** | Les notes liées sont conservées |

## Notes

| Méthode | Route | Détail |
|---|---|---|
| POST | `/classes/{id}/grades` **F** | Saisie groupée, voir ci-dessous → `[{ id, student_id, outcome: bonus\|recovery\|saved, xp_bonus }]` |
| GET | `/classes/{id}/grades` **F** | Notes de la classe, avec nom de l'élève et de l'évaluation |
| DELETE | `/grades/{id}` **F** | L'XP déjà gagnée reste acquise |
| GET | `/me/grades` | Élève : `{ grades, average (sur 20, pondérée), recovery_plans }` |

```json
{
  "evaluation_id": "…",
  "subject": "Réseau",
  "max": 20,
  "coef": 2,
  "graded_on": "2026-10-13",
  "entries": [{ "student_id": "…", "value": 15.5 }, { "student_id": "…", "value": 8 }]
}
```

`subject` est facultatif si `evaluation_id` est donné (le thème, sinon le titre, de l'évaluation est repris). Il est comparé au thème des quiz pour les plans de rattrapage. Règles : note entre 0 et `max`, date pas dans le futur, élève membre de la classe. Une note d'au moins 14/20 datée de moins de 14 jours donne +20 XP (`bonus`) ; une note sous 10/20 ouvre un plan de rattrapage de 14 jours (`recovery`).

## Dragon (élèves)

| Méthode | Route | Détail |
|---|---|---|
| GET | `/me/pet` | `{ pet, recovery_plans, recent_events, rules }` ; 403 pour un formateur |
| PATCH | `/me/pet` | `{ name }` (1 à 24 caractères) |

`pet` : `{ name, xp, level, stage: egg|baby|young, xp_in_level, xp_needed, streak, earned_today, daily_cap, last_active_day, next_stage }`. Les règles de gain sont détaillées dans [ALIGNEMENT.md](ALIGNEMENT.md#règles-du-dragon).

## Temps réel (T-004)

Connexion : `ws://localhost:3000/ws?token=<jwt>`, puis abonnement aux rooms :

```json
{ "type": "subscribe", "room": "quiz:<uuid>" }
{ "type": "unsubscribe", "room": "quiz:<uuid>" }
```

| Room | Accès | Messages reçus |
|---|---|---|
| `quiz:{id}` | quiz visible | `{ type: "leaderboard", quiz_id, entries }` à chaque fin de tentative ou correction |
| `challenge:{id}` | participants | `{ type: "challenge", challenge }` à chaque changement d'état |
| `user:{id}` | soi-même | idem pour tous ses défis (notification d'un nouveau défi reçu) |

Le serveur répond `subscribed`, `unsubscribed` ou `error`.
