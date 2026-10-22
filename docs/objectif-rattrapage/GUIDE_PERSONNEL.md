# Objectif de rattrapage : guide personnel

Document de révision pour l'oral. Il explique ce qui a été modifié, pourquoi, comment le code fonctionne de bout en bout, et les questions pièges probables avec leurs réponses.

Branche : `feat/objectif-rattrapage` (9 commits, un par étape).

---

## 1. Le besoin en une phrase

Le formateur peut fixer, pour un plan de rattrapage, un **nombre de bonnes réponses à obtenir**. Cet objectif est **strictement positif**, **facultatif**, et un plan sans objectif fonctionne **exactement comme avant**.

## 2. Le point à bien comprendre avant tout : un plan n'est pas stocké

C'est la clé de toute la conception. Il n'existe **aucune table** `recovery_plans`. Un plan est **recalculé à chaque lecture** par la fonction pure `xp::active_recovery_plans` ([backend/src/xp.rs:205](../../backend/src/xp.rs#L205)) :

1. on regroupe les notes de l'élève **par matière** (comparaison insensible à la casse et aux espaces : `same_subject`) ;
2. pour chaque matière, on prend la **dernière mauvaise note** (moins de 10/20, ramenée sur 20) ;
3. le plan dure **14 jours** à partir de la date de cette note (`RECOVERY_DAYS`) ;
4. il se ferme plus tôt si une note **correcte** (10/20 ou plus) de la même matière arrive **un jour postérieur**.

Conséquence : l'objectif ne peut pas être rattaché à « un plan », puisqu'un plan n'a pas d'identifiant. On le rattache à **la note qui ouvre le plan**. D'où la table `recovery_goals` avec `grade_id` comme clé.

## 3. Base de données

### La migration

[backend/migrations/0003_objectif_rattrapage.sql](../../backend/migrations/0003_objectif_rattrapage.sql)

```sql
CREATE TABLE recovery_goals (
    grade_id   uuid PRIMARY KEY REFERENCES grades(id) ON DELETE CASCADE,
    target     integer NOT NULL CHECK (target > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
```

Chaque morceau a une raison :

| Élément | Rôle |
|---|---|
| `grade_id` **PRIMARY KEY** | Une note a **au plus un** objectif. La clé primaire impose l'unicité et crée l'index. |
| `REFERENCES grades(id)` | Impossible de créer un objectif pour une note qui n'existe pas (vérifié : erreur `violates foreign key constraint`). |
| `ON DELETE CASCADE` | Supprimer la note supprime son objectif, sans une ligne de code Rust (vérifié en base). |
| `NOT NULL` | Une ligne sans valeur n'aurait pas de sens : l'absence d'objectif, c'est l'**absence de ligne**. |
| `CHECK (target > 0)` | Dernière barrière : même une requête SQL écrite à la main ne peut pas insérer 0 ou un négatif. |
| `created_at DEFAULT now()` | Traçabilité, sans rien à fournir côté code. |

### Relation entre les tables

`grades` 1 ↔ 0..1 `recovery_goals`. Relation « un à zéro ou un », obtenue parce que la clé étrangère **est aussi** la clé primaire.

### Pourquoi une table séparée et pas une colonne `grades.recovery_target` ?

Imposé par le jury, mais il faut savoir le défendre :
- **séparation des responsabilités** : `grades` décrit une évaluation ; l'objectif est une donnée pédagogique du formateur, qui n'a de sens que pour une partie des notes (les mauvaises). Une colonne serait `NULL` pour la grande majorité des lignes ;
- **aucune modification de `grades`** : pas de risque sur une table centrale déjà utilisée par toutes les requêtes ;
- **aucune donnée à migrer** : les notes existantes n'ont simplement pas de ligne dans `recovery_goals` ;
- **évolutif** : si on veut plus tard suivre la progression, ajouter une date de fin, un commentaire, on enrichit `recovery_goals` sans toucher à `grades`.

### Pourquoi une nouvelle migration et pas une modification de 0001 ou 0002 ?

sqlx enregistre dans la table `_sqlx_migrations` une **empreinte (checksum)** de chaque migration appliquée. Si on modifie un fichier déjà appliqué, au démarrage `sqlx::migrate!()` voit que l'empreinte ne correspond plus et **refuse de démarrer**. On ajoute donc toujours un nouveau fichier numéroté. La migration 0003 s'applique automatiquement au démarrage du serveur ([backend/src/db/mod.rs](../../backend/src/db/mod.rs)).

## 4. Backend : le parcours d'une donnée

### 4.1 Écriture à la saisie des notes (`POST /classes/{id}/grades`)

Fichier [backend/src/routes/grades.rs](../../backend/src/routes/grades.rs).

1. **Le modèle** ([grades.rs:71](../../backend/src/routes/grades.rs#L71)) : `Entry` reçoit `recovery_target: Option<i32>`. Avec serde, un champ `Option` **absent du JSON vaut `None`**. Les anciens clients qui n'envoient pas ce champ continuent de fonctionner.
2. **La validation, avant toute écriture** ([grades.rs:134-142](../../backend/src/routes/grades.rs#L134-L142)) : on parcourt toutes les entrées avec un `match` :
   - `Some(t) if t <= 0` → 400 « l'objectif doit être supérieur à 0 » ;
   - `Some(_)` sur une note qui n'est pas mauvaise → 400 « l'objectif n'a de sens que pour une note qui ouvre un plan » ;
   - sinon on continue.

   On réutilise `xp::grade_level(value, max)`, la **même fonction** que celle qui décide si un plan s'ouvre. Il n'y a donc pas de deuxième règle « moins de 10 » côté serveur.
3. **L'écriture, dans la transaction** ([grades.rs:197-203](../../backend/src/routes/grades.rs#L197-L203)) : juste après `INSERT INTO grades ... RETURNING id`, si un objectif est présent, `INSERT INTO recovery_goals (grade_id, target)` avec l'`id` qui vient d'être généré, **sur la même transaction `tx`**.
4. **Atomicité** : tout le lot est dans une transaction ouverte par `state.db.begin()` ([grades.rs:144](../../backend/src/routes/grades.rs#L144)). Si une erreur survient avant `tx.commit()`, la transaction est abandonnée (le `Drop` de sqlx fait un `ROLLBACK`). Résultat : **soit toutes les notes et tous les objectifs sont enregistrés, soit rien**. Le smoke test le vérifie : un lot « Alice 15 + Bob 7 avec objectif 0 » est refusé et le nombre de notes de la classe ne change pas.

### 4.2 Modification après coup (`PUT` et `DELETE /grades/{id}/recovery-goal`)

Route déclarée [grades.rs:27](../../backend/src/routes/grades.rs#L27), même syntaxe `{id}` qu'axum 0.8 utilise pour `delete_grade`.

`set_recovery_goal` ([grades.rs:237](../../backend/src/routes/grades.rs#L237)), dans cet ordre :

| Étape | Échec | Pourquoi cet ordre |
|---|---|---|
| `target > 0` | 400 | Contrôle gratuit, sans base : on rejette tôt. |
| La note existe | 404 | Il faut sa classe pour vérifier les droits. |
| `owned_class` sur la classe de la note | 403 (élève) ou 404 (autre formateur) | Le formateur ne peut agir que sur **ses** classes. |
| La note ouvre un plan | 400 | Règle métier, après les droits pour ne rien révéler à un intrus. |

Écriture **idempotente** (rejouer la même requête donne le même état) :

```sql
INSERT INTO recovery_goals (grade_id, target) VALUES ($1, $2)
ON CONFLICT (grade_id) DO UPDATE SET target = EXCLUDED.target
```

`ON CONFLICT` s'appuie sur la clé primaire : si une ligne existe déjà pour cette note, on met à jour `target` au lieu d'échouer. `EXCLUDED` désigne la ligne qu'on voulait insérer. C'est un « upsert » en une seule requête, sans risque de course entre un `SELECT` et un `INSERT`.

`delete_recovery_goal` ([grades.rs:267](../../backend/src/routes/grades.rs#L267)) : mêmes contrôles d'existence et de propriété, puis `DELETE`. Il renvoie 204 même s'il n'y avait pas d'objectif (idempotent aussi).

Réponse `204 No Content` : l'action a réussi et il n'y a rien à renvoyer.

### 4.3 Lecture : comment l'objectif remonte dans le plan

[backend/src/xp.rs](../../backend/src/xp.rs) :
- `GradeRef` ([xp.rs:186](../../backend/src/xp.rs#L186)) et `RecoveryPlan` ([xp.rs:194](../../backend/src/xp.rs#L194)) ont un nouveau champ `target: Option<i32>` ;
- dans `active_recovery_plans`, on garde désormais **la note entière** (et plus seulement sa date) :

  ```rust
  let last_bad_grade = list.iter()
      .filter(|g| grade_level(g.value, g.max) == GradeLevel::Bad)
      .max_by_key(|g| g.graded_on)?;
  let last_bad = last_bad_grade.graded_on;
  // ...
  RecoveryPlan { subject, until, target: last_bad_grade.target }
  ```

  Avant, on faisait `.map(|g| g.graded_on).max()` : on perdait la note, donc on ne pouvait pas récupérer son objectif.

- Le `?` après `max_by_key` : s'il n'y a aucune mauvaise note dans la matière, `max_by_key` renvoie `None` et le `?` fait sortir la closure de `filter_map` avec `None` : pas de plan pour cette matière. Comportement identique à avant.

**Où sont construits les `GradeRef` ?** À deux endroits, qui lisent tous les deux l'objectif :

| Fichier | Usage | Modification |
|---|---|---|
| [classes.rs:274-281](../../backend/src/routes/classes.rs#L274-L281) | Tableau de bord formateur | `LEFT JOIN recovery_goals`, `rg.target` en 8e élément du tuple `GradeTuple` |
| [pet.rs:137-155](../../backend/src/routes/pet.rs#L137-L155) | Vue élève (`/me/grades`, `/me/pet`) et calcul d'XP de fin de quiz | même jointure |

**Pourquoi `LEFT JOIN` et pas `JOIN` ?** Un `JOIN` (interne) ne garderait que les notes **qui ont** un objectif : toutes les autres notes disparaîtraient, les moyennes et les plans seraient faux. `LEFT JOIN` garde toutes les notes ; `rg.target` vaut `NULL` quand il n'y a pas de ligne, et sqlx le convertit en `None` grâce au type `Option<i32>`.

**Pourquoi `ORDER BY g.graded_on, g.created_at` ?** Pour le cas de deux mauvaises notes de la même matière **le même jour**. `max_by_key` renvoie, en cas d'égalité, **le dernier** élément maximal (c'est documenté dans la bibliothèque standard Rust). Sans `ORDER BY`, PostgreSQL ne garantit aucun ordre : l'objectif affiché pourrait changer d'un appel à l'autre. Avec le tri, c'est **la dernière note saisie** qui l'emporte. Le test `objectif_de_la_derniere_mauvaise_note` vérifie ce comportement.

### 4.4 Ce qui n'a pas bougé : l'XP

`target` est **informatif**. `apply_quiz` ne le lit pas. `theme_in_recovery` compare seulement la matière. Les bonus de rattrapage restent `+3 XP` par bonne réponse, plafonnés à `+15` par quiz.

## 5. Frontend

| Fichier | Modification |
|---|---|
| [web/src/api/client.ts](../../web/src/api/client.ts) | `RecoveryPlan` gagne `target: number \| null`. Le compilateur TypeScript force à gérer le cas `null`. |
| [web/src/i18n/fr.ts](../../web/src/i18n/fr.ts) | `dashboard.recoveryGoal(n)` → « objectif : 8 bonnes réponses » ; `grades.recoveryGoal(n)` pour la vue élève ; libellés du champ de saisie. Utilise `plural` (« 1 bonne réponse », « 2 bonnes réponses »). |
| [web/src/pages/DashboardPage.tsx](../../web/src/pages/DashboardPage.tsx#L103) | `{p.target !== null && \` · ${...}\`}` : rendu conditionnel. Sans objectif, React n'affiche rien (`false` n'est pas rendu) : le badge est identique à avant. |
| [web/src/pages/GradesPage.tsx](../../web/src/pages/GradesPage.tsx#L44) | Même chose dans la carte de plan côté élève. |
| [web/src/components/GradeBook.tsx](../../web/src/components/GradeBook.tsx) | Sous chaque champ de note, un petit champ « obj. ». |

### Le champ de saisie dans le carnet de notes

- `opensRecovery(value, max)` ([GradeBook.tsx:55](../../web/src/components/GradeBook.tsx#L55)) ramène la note **sur 20 avec le barème saisi** et la compare à la constante `BAD` (10) déjà présente dans le composant. Le champ objectif est **désactivé** sinon.
- À l'enregistrement : si le champ est vide ou si la note n'ouvre pas de plan, on n'envoie pas `recovery_target`. Sinon on vérifie `Number.isInteger(target) && target > 0` ; en cas d'échec, message d'erreur et **aucun envoi**.
- La validation côté client est du **confort** (retour immédiat). La **sécurité**, c'est le serveur et la base : un client modifié qui enverrait 0 reçoit quand même 400.

## 6. Défense en profondeur : trois niveaux de validation

| Niveau | Où | Ce qu'il bloque |
|---|---|---|
| Interface | `GradeBook.tsx` | Saisie de 0, négatif, décimal, texte ; champ désactivé pour une bonne note |
| API | `grades.rs` | 0 et négatif (400), objectif sur une note sans plan (400), type invalide (422 par axum) |
| Base | `CHECK (target > 0)`, clé étrangère | Toute écriture, même hors application |

## 7. Tests

### Rust (`cargo test`, [xp.rs](../../backend/src/xp.rs))

12 tests : les 9 existants (inchangés, seul `plans_de_rattrapage` a reçu `target: None` dans ses `GradeRef`) et 3 nouveaux :

| Test | Ce qu'il prouve |
|---|---|
| `plan_avec_objectif` | Une note 7/20 avec objectif 8 donne un plan avec `target == Some(8)`. |
| `plan_sans_objectif` | Même note sans objectif : `target == None`, mêmes dates. Non-régression. |
| `objectif_de_la_derniere_mauvaise_note` | 3 mauvaises notes : seule la plus récente compte, et à date égale la dernière de la liste. Teste aussi la casse (« réseau » / « Réseau »). |

Ce sont des tests de **fonctions pures** : pas de base, pas de réseau, instantanés.

### Bout en bout (`backend/scripts/smoke.sh`)

16 vérifications ajoutées (44 au total, 0 échec) : objectif 0 et négatif refusés, lot refusé sans aucune note créée, objectif sur 14/20 refusé, création nominale, affichage dans le tableau de bord et la vue élève, `PUT` (0, élève, autre formateur, note inconnue, bonne note, valeur valide), modification, `DELETE`.

Une fonction `status` a été ajoutée au script : `call` utilise `curl -f`, qui fait **échouer** le script sur une réponse 4xx. Pour tester un refus, on lit le code HTTP seul (`-w '%{http_code}'`).

### Vérification des plans existants

1. Copie de la base de dev dans une base temporaire `quiz_objectif` (pour ne pas toucher à tes données).
2. Ancien binaire : capture du JSON du tableau de bord (2 plans : Joshua et Pierre, Réseau, jusqu'au 25/10).
3. Nouveau binaire : migration 0003 appliquée, même capture.
4. `diff` : **identique** à l'exception du nouveau champ `target`, qui vaut `null` partout.

## 8. Questions pièges et réponses

**« Pourquoi ne pas avoir stocké les plans dans une table ? »**
Ce n'était pas le périmètre, et un plan dépend de toutes les notes de la matière et de la date du jour : le stocker obligerait à le recalculer à chaque saisie, suppression de note, et chaque jour qui passe (expiration à 14 jours). Le calcul à la lecture évite toute désynchronisation.

**« Que se passe-t-il si le formateur supprime la note ? »**
`ON DELETE CASCADE` supprime l'objectif. Le plan est recalculé à partir des notes restantes : s'il reste une mauvaise note plus ancienne avec son propre objectif, c'est celui-là qui s'affiche.

**« L'élève a deux mauvaises notes en Réseau, avec deux objectifs différents. Lequel s'affiche ? »**
Celui de la **plus récente**. L'objectif de l'ancienne reste en base mais n'est pas affiché. C'est cohérent : c'est la dernière mauvaise note qui fixe la date de fin du plan.

**« Et deux mauvaises notes le même jour ? »**
La dernière saisie (`ORDER BY graded_on, created_at` + `max_by_key` qui garde le dernier maximum). Limite : deux notes saisies **dans la même requête** ont le même `created_at` (dans PostgreSQL, `now()` vaut l'heure de **début de la transaction**). Ce cas demande que le même élève apparaisse deux fois dans un même lot, ce que l'interface ne permet pas.

**« Le plan est terminé : l'objectif est-il supprimé ? »**
Non. Le plan disparaît de l'affichage (note correcte postérieure ou 14 jours écoulés), mais la ligne reste dans `recovery_goals`. Elle n'est simplement plus lue. Elle sert d'historique et disparaît avec la note.

**« Pourquoi `i32` et pas `u32`, puisque l'objectif est positif ? »**
PostgreSQL n'a pas d'entier non signé : `integer` correspond à `i32`, et sqlx associe les deux directement. Et un `u32` ne rejetterait pas 0. La règle « strictement positif » est donc vérifiée explicitement en Rust et par le `CHECK`.

**« Si j'envoie `"recovery_target": 8.5` ou `"8"` ? »**
Axum ne peut pas désérialiser le JSON vers `i32` : réponse **422** (Unprocessable Entity) avec le détail. C'est le comportement de toutes les routes du projet. Le test a été fait : 8.5, "8" et 3000000000 (dépasse `i32`) donnent 422.

**« Et `"recovery_target": null` ? »**
`None`, exactement comme si le champ était absent : la note est enregistrée sans objectif.

**« Un autre formateur fait `PUT` sur ma note : pourquoi 404 et pas 403 ? »**
C'est le fonctionnement existant d'`owned_class` ([classes.rs:52](../../backend/src/routes/classes.rs#L52)) : pour un formateur qui n'est pas propriétaire, il répond « introuvable » afin de **ne pas révéler** que la ressource existe. Un élève reçoit 403, car `require_trainer` échoue avant. Le plan initial prévoyait 403 pour « non propriétaire » : c'est un écart assumé, cohérent avec le reste de l'API.

**« Pourquoi vérifier `target > 0` en Rust alors que la base a déjà un CHECK ? »**
Pour renvoyer un **400 avec un message clair**. Si seul le CHECK bloquait, sqlx remonterait une erreur de base, transformée en 500 « erreur interne » par `AppError::Db`. Le CHECK reste utile comme filet de sécurité.

**« Pourquoi valider avant la transaction plutôt que dans la boucle ? »**
Le plan prévoyait le contrôle « la note ouvre un plan » dans la boucle, après l'`INSERT`. Il a été placé avant, avec le contrôle `> 0` : il ne dépend que des données reçues, donc inutile d'ouvrir une transaction et d'écrire pour ensuite tout annuler. Le résultat est le même (aucune donnée en cas d'erreur), mais sans travail inutile en base.

**« Le seuil de 10/20 est-il dupliqué ? »**
Oui, c'est une limite connue et préexistante : `BAD_GRADE_THRESHOLD` côté serveur ([xp.rs](../../backend/src/xp.rs)) et `BAD` dans `GradeBook.tsx`. Si on change l'un sans l'autre, le champ de saisie serait actif ou inactif à tort, mais **le serveur reste la référence** : il refusera un objectif mal placé.

**« L'objectif change-t-il l'XP gagnée ? »**
Non, il est purement informatif, par choix. Le suivi de progression (« 3 sur 8 ») et une récompense à l'objectif atteint sont des évolutions possibles, hors périmètre.

**« Comment prouvez-vous que les anciens plans n'ont pas changé ? »**
Trois preuves : le test `plan_sans_objectif`, le smoke test (le plan « reseau » sans objectif reste `null` à côté du plan « sql » avec objectif), et la comparaison avant/après migration sur la copie de la base de démo.

**« Que fait `EXCLUDED` ? »**
Dans `INSERT ... ON CONFLICT DO UPDATE`, `EXCLUDED` est la ligne qu'on a tenté d'insérer et qui est entrée en conflit. `SET target = EXCLUDED.target` remplace l'ancienne valeur par la nouvelle.

**« Pourquoi `Option<i32>` ne casse pas les anciens clients ? »**
Serde traite un champ `Option` manquant comme `None` par défaut. Aucun attribut `#[serde(default)]` n'est nécessaire pour `Option`.

**« Comment montrer le CHECK au jury ? »**
```sql
\d recovery_goals
INSERT INTO recovery_goals (grade_id, target)
  VALUES ((SELECT id FROM grades LIMIT 1), 0);
-- ERROR: new row for relation "recovery_goals" violates check constraint "recovery_goals_target_check"
```
Depuis le terminal : `docker exec -it slayyourenemies-bts-db-1 psql -U quiz -d quiz`.

## 9. Limites à connaître

- Un seul objectif compte par plan : celui de la dernière mauvaise note de la matière.
- L'objectif disparaît de l'affichage quand le plan se ferme, mais reste en base.
- Seuil de 10/20 codé à deux endroits (serveur et carnet de notes).
- Pas de suivi de progression ni de récompense : hors périmètre.
- Le test web `Layout.test.tsx` produit 2 erreurs non gérées (déjà présentes avant ces modifications, non corrigées ici) : les 12 tests passent mais `npm test` sort en échec.
- Le PDF `livrables/schema-sql.pdf` et l'image `docs/presentation/V4-schema-bdd.png` n'ont pas été régénérés : `livrables/schema.sql` et `docs/schema.dbml` sont à jour, et un diagramme ciblé est fourni (`docs/objectif-rattrapage/schema-suivi.png`).

## 10. Historique des commits

| Commit | Contenu |
|---|---|
| Migration 0003 | Table `recovery_goals` |
| Plans de rattrapage | `target` dans `GradeRef` et `RecoveryPlan`, jointures, tri, 3 tests Rust |
| Notes | `recovery_target` à la saisie, routes `PUT` et `DELETE` |
| Smoke test | 16 vérifications de bout en bout |
| Suivi formateur | Affichage dans le tableau de bord et la vue élève |
| Carnet de notes | Champ objectif à la saisie |
| Schéma SQL | `schema.sql` régénéré, `schema.dbml` |
| Documentation API | Nouvelles routes et nouveau champ |
| Documentation | Ce guide, la présentation, les captures et le schéma ciblé |
