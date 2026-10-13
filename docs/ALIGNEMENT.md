# Alignement : cahier des charges, roadmap, schéma SQL et code

Point de départ : l'app perso « Slay your enemies » (web, local-first, un seul utilisateur, dragon de compagnie). Le CDC CDD-QUIZ-2026-001 demande une plateforme multi-utilisateurs (formateurs / étudiants) avec backend, mobile et web. Ce document dit ce qui est fait, ce qu'on a gardé de la base et ce qui reste à faire, phase par phase.

État au 13 octobre 2026 (Phase 2).

## Choix du binôme

- **Classes** : un formateur crée des classes, les élèves les rejoignent avec un code à 6 caractères. Les évaluations, les notes et le suivi se font par classe.
- **Réservé au formateur** : saisie des dates d'évaluation et des notes. L'élève les consulte.
- **Dragon pour l'élève seulement** : il gagne de l'XP avec les quiz, les défis gagnés et les bonnes notes. Le formateur voit le dragon de chaque élève dans l'onglet « Suivi ».
- **Retirés** (hors CDC) : import de cours Markdown, fiches, textes à trous, répétition espacée, rappels. Le code reste dans le commit initial si besoin.

## Organisation du dépôt

| Dossier | Contenu | Phase |
|---|---|---|
| `backend/` | API Rust (Axum, sqlx, PostgreSQL), arborescence prévue au CDC | 2 |
| `backend/migrations/` | Schéma SQL : `0001` = livrable dbdiagram, `0002` = classes, notes, dragons | 1 → 2 |
| `web/` | App React + TypeScript, branchée sur l'API | 4 |
| `mobile/` | À créer : React Native + TypeScript (Expo conseillé) | 3 |
| `docs/` | Documentation API, schéma complet (`schema.dbml`), ce document | 2, 7 |

## Fonctionnalités du CDC

Légende : ✅ fait · 🟡 partiel · ⬜ à faire · — hors périmètre de la phase.

### Formateurs

| ID | Statut CDC | API | Web | Mobile | Notes |
|---|---|---|---|---|---|
| F-001 Création de quiz | MVP | ✅ | ✅ | — | Création, puis éditeur ; publier / repasser en brouillon |
| F-002 Gestion des questions | MVP | ✅ | ✅ | — | QCM (2 à 6 réponses), Vrai / Faux, texte libre ; ajout, modification, suppression |
| F-003 Catégorisation | MVP | ✅ | ✅ | — | Thème + difficulté |
| F-004 Partage | Bonus | 🟡 | 🟡 | — | Les classes servent de groupes ; reste à restreindre un quiz à une classe |
| F-005 Suivi des résultats | MVP | ✅ | 🟡 | — | Onglet « Suivi » (dragon, moyenne, activité, rattrapage) ; statistiques par question pas encore affichées |
| F-006 Export PDF/CSV | Bonus | ⬜ | ⬜ | — | CSV faisable côté web à partir de `/stats` et `/classes/{id}/grades` |
| F-007 Correction automatique | MVP | ✅ | ✅ | — | Texte libre : « Copies à corriger » dans l'éditeur du quiz |
| F-008 Création de défis | MVP | ✅ | ⬜ | ⬜ | |
| Ajout : classes | — | ✅ | ✅ | ⬜ | Création, code d'invitation, retrait d'un élève |
| Ajout : évaluations | — | ✅ | ✅ | ⬜ | Contrôle, examen, projet, par classe |
| Ajout : notes | — | ✅ | ✅ | ⬜ | Saisie pour toute la classe en une fois, barème et coefficient |

### Étudiants

| ID | Statut CDC | API | Web | Mobile | Notes |
|---|---|---|---|---|---|
| E-001 Accès aux quiz + filtres | MVP | ✅ | 🟡 | ⬜ | Liste faite, filtres à ajouter |
| E-002 Répondre aux quiz | MVP | ✅ | ✅ | ⬜ | Une question à la fois, correction et explication après chaque réponse, raccourcis clavier |
| E-003 Timer par question | MVP | ✅ | ✅ | ⬜ | Compte à rebours affiché ; à zéro, la question part sans réponse ; vérifié aussi côté serveur |
| E-004 Jokers | Bonus | ⬜ | ⬜ | ⬜ | « Passer » = réponse sans `answer_id` (déjà géré) |
| E-005 Classement | MVP | ✅ | 🟡 | ⬜ | Affiché à la fin d'une partie (10 premiers) ; pas encore de page dédiée ni de mise à jour en direct |
| E-006 Historique | MVP | ✅ | ⬜ | ⬜ | `/me/attempts` |
| E-007 Défis | MVP | ✅ | ⬜ | ⬜ | Les membres d'une classe sont listés pour choisir un adversaire |
| E-008 Notifications | Bonus | 🟡 | ⬜ | ⬜ | Room `user:{id}` en temps réel |
| Ajout : dragon | — | ✅ | ✅ | ⬜ | Niveau, stade, série, historique des gains, plans de rattrapage |
| Ajout : notes et évaluations | — | ✅ | ✅ | ⬜ | Consultation seule |

### Techniques

| ID | Statut CDC | État | Notes |
|---|---|---|---|
| T-001 Authentification | MVP | ✅ | Email / mot de passe, bcrypt, JWT maison ; mode démo sans mot de passe en local |
| T-002 PostgreSQL | MVP | ✅ | `docker compose up -d` en local |
| T-003 API REST | MVP | ✅ | Voir [API.md](API.md) |
| T-004 Temps réel | MVP | ✅ | `/ws`, rooms `quiz:`, `challenge:`, `user:` |
| T-005 Images | Bonus | 🟡 | Colonne `image_url` prête, upload R2 à faire |
| T-006 Responsive | MVP | ✅ | Navigation en bas d'écran sur mobile |
| T-007 Hors ligne | Bonus | ⬜ | Le stockage local de la base a été retiré avec les anciens outils ; seul le cache de l'interface (PWA) reste |

## Règles du dragon

Reprises de l'app d'origine et calculées par le serveur (`backend/src/xp.rs`, testées) :

| Gain | XP | Conditions |
|---|---|---|
| Quiz terminé | +15 | Au moins une réponse |
| Maîtrise | +5 par question | Réussie alors qu'elle avait été ratée à une tentative précédente |
| Série | jusqu'à +50 % | +5 % par jour consécutif de quiz |
| Plan de rattrapage | +3 par bonne réponse, max +15 | Quiz du même thème qu'une note sous 10/20 de moins de 14 jours |
| Plafond | 60 par jour | Sur les quiz uniquement |
| Défi gagné | +10 | Hors plafond |
| Bonne note | +20 | Au moins 14/20, datée de moins de 14 jours, hors plafond |

Le dragon ne perd jamais d'XP ni de niveau ; supprimer une note ne retire rien. Stades : oeuf (niveaux 1 à 4), bébé (5 à 14), jeune (15 et plus). Ces seuils sont dupliqués entre `backend/src/xp.rs` et `web/src/domain/pet-stages.ts` : les modifier aux deux endroits.

## Ce qu'on a gardé de la base

| Élément | Usage | Fichiers |
|---|---|---|
| Design tokens, composants UI, polices pixel | Charte du projet, à transposer en React Native | `web/src/styles/`, `web/src/components/` |
| Dragon : sprites, stades, barre d'XP, série | Onglet Dragon (élève) et Suivi (formateur) | `web/src/assets/pixel/`, `DragonSprite.tsx`, `PetStats.tsx`, `domain/pet-stages.ts` |
| Règles d'XP, de notes et de rattrapage | Portées en Rust côté serveur | `backend/src/xp.rs` |
| PWA | Installation de l'app, cache de l'interface | `web/src/sw.ts` |

## Écarts avec le livrable « schéma SQL »

Le schéma complet est dans [schema.dbml](schema.dbml) : le coller dans dbdiagram.io pour régénérer le PDF.

**Tables ajoutées** (migration `0002`) : `classes`, `class_members`, `evaluations`, `grades`, `pets`, `xp_events`, et l'enum `evaluation_type`.

**Contraintes ajoutées aux tables d'origine** (migration `0001`), à reporter sur le diagramme si vous les validez :

- `UNIQUE (attempt_id, question_id)` sur `attempt_answers` : une seule réponse par question et par tentative.
- `UNIQUE (quiz_id, position)` sur `questions`.
- `CHECK (challenger_id <> challenged_id)` sur `challenges`, `CHECK` sur `seconds_per_question`, `points` et `time_ms`.
- Valeurs par défaut : `gen_random_uuid()`, `now()`, `is_published = false`, `status = 'pending'`, `points = 1`.
- Suppressions en cascade depuis `users`, `quizzes` et `questions`.

**À corriger dans le CDC** : il dit que `answers.is_correct` reste nul « en attendant une correction manuelle ». En pratique c'est `attempt_answers.is_correct` qui est nul en attendant la correction ; pour une question en texte libre, `answers` contient au plus une ligne : la réponse attendue, indicative pour le formateur.

**Le CDC devra aussi décrire** les classes, les évaluations, les notes et le dragon, qui n'y figurent pas.

## Roadmap

| Phase | Dates | État | Reste à faire |
|---|---|---|---|
| 1. Analyse et conception | 25 sept → 9 oct | 🟡 | Maquettes Figma à finaliser ; schéma SQL et CDC à mettre à jour (classes, notes, dragon) |
| 2. Backend | 9 oct → 6 nov | 🟡 | API faite, documentée, testée (`cargo test` + `scripts/smoke.sh`). Reste : limitation de débit sur `/auth`, restreindre un quiz à une classe |
| 3. Mobile | 6 nov → 18 déc | ⬜ | Créer `mobile/` (Expo + TypeScript), écrans élève en priorité : quiz, dragon, classement, défis |
| 4. Web | 18 déc → 8 jan | 🟡 | Fait : connexion, classes, évaluations, notes, dragon, suivi, éditeur de quiz, passage d'un quiz, correction du texte libre. Reste : défis, historique, statistiques par question, filtres, classement en direct |
| 5. Intégration et tests | 8 jan → 29 jan | ⬜ | Rapport de tests, revue RGPD |
| 6. Déploiement | 29 jan → 5 fév | ⬜ | Fly.io (API + Postgres), Vercel (web), APK pour la soutenance ; `DEMO_MODE` désactivé en production |
| 7. Documentation | 5 fév → 12 fév | ⬜ | Guide utilisateur, support de soutenance |

## Points RGPD et sécurité déjà couverts

- Mots de passe hachés (bcrypt), jamais renvoyés par l'API.
- Validation des entrées côté serveur (email, longueurs, barèmes, dates, appartenance à la classe).
- Contrôle d'accès : rôle formateur, auteur du quiz, formateur de la classe, membre de la classe, participant au défi.
- Un élève ne voit que ses propres notes ; le code d'une classe n'est visible que de son formateur.
- Les bonnes réponses ne sont jamais envoyées à l'étudiant avant la fin de sa tentative.
- Reste à faire : HTTPS (fourni par l'hébergeur), suppression de compte (droit à l'effacement, la cascade SQL est prête), mention d'information sur les données collectées (notes et activité visibles du formateur).
