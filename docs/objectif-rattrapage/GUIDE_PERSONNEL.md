# Objectif et durée de rattrapage : guide personnel

Document de révision pour l'oral. Il explique ce qui a été modifié, pourquoi, comment le code fonctionne de bout en bout, et les questions pièges probables avec leurs réponses.

Branche : `feat/objectif-rattrapage`, pull request n° 50 (20 commits, un par étape).

---

## 1. Le besoin

Deux demandes successives de TechLearn Solutions :

1. **Objectif** : le formateur fixe, pour un plan de rattrapage, un **nombre de bonnes réponses à obtenir**. Strictement positif, facultatif.
2. **Durée** : le formateur peut **changer le nombre de jours** du plan (14 par défaut). Entre 1 et 365, facultatif.

Dans les deux cas, un plan sans réglage fonctionne **exactement comme avant**. Le formateur règle objectif et durée **à la saisie** d'une note, ou **après coup** depuis le carnet de notes (bouton roue à côté d'une note sous 10/20).

## 2. Le point à bien comprendre avant tout : un plan n'est pas stocké

C'est la clé de toute la conception. Il n'existe **aucune table** `recovery_plans`. Un plan est **recalculé à chaque lecture** par la fonction pure `xp::active_recovery_plans` ([backend/src/xp.rs:211](../../backend/src/xp.rs#L211)) :

1. on regroupe les notes de l'élève **par matière** (comparaison insensible à la casse et aux espaces : `same_subject`) ;
2. pour chaque matière, on prend la **dernière mauvaise note** (moins de 10/20, ramenée sur 20) ;
3. le plan dure **14 jours** à partir de la date de cette note (`RECOVERY_DAYS`), **ou la durée fixée sur cette note** ;
4. il se ferme plus tôt si une note **correcte** (10/20 ou plus) de la même matière arrive **un jour postérieur**.

Conséquence : objectif et durée ne peuvent pas être rattachés à « un plan », puisqu'un plan n'a pas d'identifiant. On les rattache à **la note qui ouvre le plan**. D'où la table `recovery_goals` avec `grade_id` comme clé.

### Est-ce que la durée a changé beaucoup de choses ?

Non, et c'est la conséquence directe de ce choix. La durée intervient à **une seule ligne** du calcul :

```rust
// avant
let until = last_bad + chrono::Duration::days(RECOVERY_DAYS);
// après
let days = last_bad_grade.days.map_or(RECOVERY_DAYS, i64::from);
let until = last_bad + chrono::Duration::days(days);
```

Tout le reste suit le même chemin que l'objectif, qui était déjà en place : une colonne de plus dans `recovery_goals`, un champ de plus dans les structures, la jointure et le formulaire.

## 3. Base de données

### Migration 0003 : la table

[backend/migrations/0003_objectif_rattrapage.sql](../../backend/migrations/0003_objectif_rattrapage.sql)

```sql
CREATE TABLE recovery_goals (
    grade_id   uuid PRIMARY KEY REFERENCES grades(id) ON DELETE CASCADE,
    target     integer NOT NULL CHECK (target > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
```

### Migration 0004 : la durée

[backend/migrations/0004_duree_rattrapage.sql](../../backend/migrations/0004_duree_rattrapage.sql)

```sql
ALTER TABLE recovery_goals ALTER COLUMN target DROP NOT NULL;
ALTER TABLE recovery_goals ADD COLUMN days integer CHECK (days BETWEEN 1 AND 365);
ALTER TABLE recovery_goals ADD CONSTRAINT recovery_goals_not_empty
    CHECK (target IS NOT NULL OR days IS NOT NULL);
```

- `target` devient **facultatif** : un formateur peut vouloir allonger le plan sans fixer d'objectif.
- `days` est **facultatif** : `NULL` veut dire « durée par défaut, 14 jours ».
- `recovery_goals_not_empty` : une ligne porte **au moins l'un des deux**. On garde ainsi la règle simple « **pas de ligne = plan par défaut** ». Sans cette contrainte, deux représentations voudraient dire la même chose (pas de ligne, ou une ligne vide), source de bugs.

### Le rôle de chaque élément

| Élément | Rôle |
|---|---|
| `grade_id` **PRIMARY KEY** | Une note a **au plus une** ligne. La clé primaire impose l'unicité et crée l'index. |
| `REFERENCES grades(id)` | Impossible de régler une note qui n'existe pas (vérifié : erreur `violates foreign key constraint`). |
| `ON DELETE CASCADE` | Supprimer la note supprime ses réglages, sans une ligne de code Rust (vérifié en base). |
| `CHECK (target > 0)` | Même une requête SQL écrite à la main ne peut pas insérer 0 ou un négatif. |
| `CHECK (days BETWEEN 1 AND 365)` | Durée réaliste, et protection contre un débordement de date (voir les questions pièges). |
| `recovery_goals_not_empty` | Pas de ligne vide. |
| `created_at DEFAULT now()` | Traçabilité, sans rien à fournir côté code. |

### Relation entre les tables

`grades` 1 ↔ 0..1 `recovery_goals`. Relation « un à zéro ou un », obtenue parce que la clé étrangère **est aussi** la clé primaire.

### Pourquoi une table séparée et pas des colonnes dans `grades` ?

Imposé par le jury, mais il faut savoir le défendre :
- **séparation des responsabilités** : `grades` décrit une évaluation ; objectif et durée sont des réglages pédagogiques du formateur, qui n'ont de sens que pour les mauvaises notes. Des colonnes seraient `NULL` pour la grande majorité des lignes ;
- **aucune modification de `grades`** : pas de risque sur une table centrale utilisée par toutes les requêtes ;
- **aucune donnée à migrer** : les notes existantes n'ont simplement pas de ligne dans `recovery_goals` ;
- **évolutif** : la demande « durée » l'a prouvé, on a ajouté une colonne à `recovery_goals` sans toucher à `grades`.

### Pourquoi une migration 0004 et pas une modification de 0003 ?

sqlx enregistre dans la table `_sqlx_migrations` une **empreinte (checksum)** de chaque migration appliquée. Si on modifie un fichier déjà appliqué, au démarrage `sqlx::migrate!()` voit que l'empreinte ne correspond plus et **refuse de démarrer**. Même si 0003 n'était pas encore en production, la règle est la même : une nouvelle demande, une nouvelle migration. Les migrations s'appliquent au démarrage du serveur ([backend/src/db/mod.rs](../../backend/src/db/mod.rs)).

## 4. Backend : le parcours d'une donnée

### 4.1 Écriture à la saisie des notes (`POST /classes/{id}/grades`)

Fichier [backend/src/routes/grades.rs](../../backend/src/routes/grades.rs).

1. **Le modèle** ([grades.rs:76-78](../../backend/src/routes/grades.rs#L76-L78)) : `Entry` reçoit `recovery_target: Option<i32>` et `recovery_days: Option<i32>`. Avec serde, un champ `Option` **absent du JSON vaut `None`**. Les anciens clients continuent de fonctionner.
2. **La validation, avant toute écriture** ([grades.rs:152-158](../../backend/src/routes/grades.rs#L152-L158)) : pour chaque entrée,
   - `check_goal` ([grades.rs:86](../../backend/src/routes/grades.rs#L86)) : `target <= 0` → 400 ; `days` hors de 1 à 365 → 400 ;
   - un objectif ou une durée sur une note qui n'est pas mauvaise → 400 « l'objectif et la durée n'ont de sens que pour une note qui ouvre un plan ».

   `check_goal` est **partagée** avec la route `PUT` : une seule définition des règles. Le contrôle « la note ouvre un plan » réutilise `xp::grade_level(value, max)`, la **même fonction** que celle qui décide si un plan s'ouvre.
3. **L'écriture, dans la transaction** ([grades.rs:213-220](../../backend/src/routes/grades.rs#L213-L220)) : juste après `INSERT INTO grades ... RETURNING id`, si un objectif ou une durée est présent, `INSERT INTO recovery_goals (grade_id, target, days)` avec l'`id` qui vient d'être généré, **sur la même transaction `tx`**. Une valeur `None` est envoyée comme `NULL`.
4. **Atomicité** : tout le lot est dans une transaction ouverte par `state.db.begin()` ([grades.rs:160](../../backend/src/routes/grades.rs#L160)). Si une erreur survient avant `tx.commit()`, la transaction est abandonnée (le `Drop` de sqlx fait un `ROLLBACK`). Résultat : **soit tout est enregistré, soit rien**. Le smoke test le vérifie : un lot « Alice 15 + Bob 7 avec objectif 0 » est refusé et le nombre de notes de la classe ne change pas.

### 4.2 Modification après coup (`PUT` et `DELETE /grades/{id}/recovery-goal`)

Route déclarée [grades.rs:27](../../backend/src/routes/grades.rs#L27), même syntaxe `{id}` qu'axum 0.8 utilise pour `delete_grade`.

Corps du `PUT` : `{ "target": 8, "days": 21 }`, chaque champ facultatif.

`set_recovery_goal` ([grades.rs:256](../../backend/src/routes/grades.rs#L256)), dans cet ordre :

| Étape | Échec | Pourquoi cet ordre |
|---|---|---|
| Au moins `target` ou `days` | 400 | Pour tout retirer, il y a `DELETE`. |
| `check_goal` (valeurs) | 400 | Contrôle gratuit, sans base : on rejette tôt. |
| La note existe | 404 | Il faut sa classe pour vérifier les droits. |
| `owned_class` sur la classe de la note | 403 (élève) ou 404 (autre formateur) | Le formateur ne peut agir que sur **ses** classes. |
| La note ouvre un plan | 400 | Règle métier, après les droits pour ne rien révéler à un intrus. |

Écriture **idempotente** (rejouer la même requête donne le même état) :

```sql
INSERT INTO recovery_goals (grade_id, target, days) VALUES ($1, $2, $3)
ON CONFLICT (grade_id) DO UPDATE SET target = EXCLUDED.target, days = EXCLUDED.days
```

`ON CONFLICT` s'appuie sur la clé primaire : si une ligne existe déjà pour cette note, on la met à jour au lieu d'échouer. `EXCLUDED` désigne la ligne qu'on voulait insérer. C'est un « upsert » en une seule requête, sans risque de course entre un `SELECT` et un `INSERT`.

**Sémantique de `PUT`** : il **remplace** l'ensemble. Envoyer `{ "days": 7 }` sur une note qui avait un objectif **efface l'objectif**. C'est la définition de `PUT` en HTTP ; une mise à jour partielle serait un `PATCH`. Le smoke test le vérifie (« plan raccourci à 7 jours, sans objectif »).

`delete_recovery_goal` ([grades.rs:288](../../backend/src/routes/grades.rs#L288)) : mêmes contrôles d'existence et de propriété, puis `DELETE`. Le plan redevient un plan de 14 jours sans objectif. Renvoie 204 même s'il n'y avait rien (idempotent aussi).

Réponse `204 No Content` : l'action a réussi et il n'y a rien à renvoyer.

### 4.2 bis Lecture des réglages d'une note (`GET /classes/{id}/grades`)

Pour que l'interface puisse **afficher et préremplir** les réglages d'une note existante, la liste des notes renvoie aussi `recovery_target` et `recovery_days`. La requête commune `SELECT` de [grades.rs:49-57](../../backend/src/routes/grades.rs#L49-L57) fait un `LEFT JOIN recovery_goals`, et `GradeRow` a deux champs `Option<i32>` en plus. La même requête sert `/me/grades` : l'élève voit donc aussi ces champs sur ses propres notes, ce qui ne pose pas de problème puisqu'il voit déjà l'objectif dans son plan.

### 4.3 Lecture : comment objectif et durée remontent dans le plan

[backend/src/xp.rs](../../backend/src/xp.rs) :
- `GradeRef` et `RecoveryPlan` ([xp.rs:188-200](../../backend/src/xp.rs#L188-L200)) ont deux champs `target: Option<i32>` et `days: Option<i32>` ;
- nouvelle constante `RECOVERY_MAX_DAYS = 365` ([xp.rs:37](../../backend/src/xp.rs#L37)), utilisée par la validation de l'API ;
- dans `active_recovery_plans`, on garde **la note entière** (et plus seulement sa date) :

  ```rust
  let last_bad_grade = list.iter()
      .filter(|g| grade_level(g.value, g.max) == GradeLevel::Bad)
      .max_by_key(|g| g.graded_on)?;
  let last_bad = last_bad_grade.graded_on;
  let days = last_bad_grade.days.map_or(RECOVERY_DAYS, i64::from);
  let until = last_bad + chrono::Duration::days(days);
  // ...
  RecoveryPlan { subject, until, target: last_bad_grade.target, days: last_bad_grade.days }
  ```

  Avant, on faisait `.map(|g| g.graded_on).max()` : on perdait la note, donc ses réglages.

- `map_or(RECOVERY_DAYS, i64::from)` : si `days` vaut `None`, on prend 14 ; sinon on convertit l'`i32` en `i64` (le type attendu par `Duration::days`). Conversion sans perte.
- Le `?` après `max_by_key` : s'il n'y a aucune mauvaise note dans la matière, `max_by_key` renvoie `None` et le `?` fait sortir la closure de `filter_map` avec `None` : pas de plan pour cette matière. Comportement identique à avant.
- Dans la réponse, `days` vaut la durée **personnalisée** ou `null`. La date de fin réelle est toujours dans `until`, déjà calculée.

**Où sont construits les `GradeRef` ?** À deux endroits, qui lisent tous les deux `rg.target` et `rg.days` :

| Fichier | Usage | Modification |
|---|---|---|
| [classes.rs:274-281](../../backend/src/routes/classes.rs#L274-L281) | Tableau de bord formateur | `LEFT JOIN recovery_goals`, deux éléments de plus dans le tuple `GradeTuple` |
| [pet.rs:137-157](../../backend/src/routes/pet.rs#L137-L157) | Vue élève (`/me/grades`, `/me/pet`) et calcul d'XP de fin de quiz | même jointure |

**Pourquoi `LEFT JOIN` et pas `JOIN` ?** Un `JOIN` (interne) ne garderait que les notes **qui ont** une ligne dans `recovery_goals` : toutes les autres disparaîtraient, les moyennes et les plans seraient faux. `LEFT JOIN` garde toutes les notes ; `rg.target` et `rg.days` valent `NULL` quand il n'y a pas de ligne, et sqlx les convertit en `None` grâce au type `Option<i32>`.

**Pourquoi `ORDER BY g.graded_on, g.created_at` ?** Pour le cas de deux mauvaises notes de la même matière **le même jour**. `max_by_key` renvoie, en cas d'égalité, **le dernier** élément maximal (c'est documenté dans la bibliothèque standard Rust). Sans `ORDER BY`, PostgreSQL ne garantit aucun ordre : le réglage retenu pourrait changer d'un appel à l'autre. Avec le tri, c'est **la dernière note saisie** qui l'emporte. Le test `objectif_de_la_derniere_mauvaise_note` vérifie ce comportement.

### 4.4 Effet sur l'XP : différent pour l'objectif et la durée

- **L'objectif** est **informatif**. `apply_quiz` ne le lit pas.
- **La durée a un effet indirect** : pendant un plan, `theme_in_recovery` donne le bonus de rattrapage (+3 XP par bonne réponse, plafonné à +15 par quiz) aux quiz du thème. Un plan plus long laisse donc **plus de jours** pour gagner ce bonus ; un plan plus court en laisse moins. Les règles de calcul de l'XP, elles, n'ont pas changé. C'est voulu : rallonger le temps de rattrapage, c'est précisément rallonger la période où l'effort est récompensé.

## 5. Frontend

| Fichier | Modification |
|---|---|
| [web/src/api/client.ts](../../web/src/api/client.ts) | `RecoveryPlan` gagne `target: number \| null` et `days: number \| null` ; `Grade` gagne `recovery_target` et `recovery_days`. Le compilateur TypeScript force à gérer le cas `null`. |
| [web/src/i18n/fr.ts](../../web/src/i18n/fr.ts) | `dashboard.recoveryGoal(n)` → « objectif : 8 bonnes réponses » ; `dashboard.recoveryDays(n)` → « sur 21 jours » ; libellés et messages d'erreur des champs. Utilise `plural`. |
| [web/src/pages/DashboardPage.tsx](../../web/src/pages/DashboardPage.tsx#L103-L104) | Deux rendus conditionnels. Sans réglage, React n'affiche rien (`false` n'est pas rendu) : le badge est identique à avant. |
| [web/src/pages/GradesPage.tsx](../../web/src/pages/GradesPage.tsx#L44) | Carte de plan côté élève : l'objectif s'ajoute ; la date « Jusqu'au » utilise déjà `until`, donc tient compte de la durée sans modification. |
| [web/src/components/GradeBook.tsx](../../web/src/components/GradeBook.tsx) | À la saisie : un champ « obj. » sous chaque note et une durée pour toute la saisie. Après coup : un bouton roue sur chaque note sous 10/20, qui ouvre un panneau de réglage. |

### Les champs de saisie dans le carnet de notes

- `opensRecovery(value, max)` ([GradeBook.tsx:65](../../web/src/components/GradeBook.tsx#L65)) ramène la note **sur 20 avec le barème saisi** et la compare à la constante `BAD` (10) déjà présente. Le champ objectif est **désactivé** sinon.
- **La durée est saisie une fois pour toute la colonne** (une évaluation), pas élève par élève : en pratique, le formateur donne le même délai à toute la classe pour un même contrôle. Elle n'est envoyée (`recovery_days`) que pour les notes qui ouvrent un plan. L'API, elle, accepte une durée différente par élève : on peut ajuster un élève avec `PUT`.
- À l'enregistrement : la durée doit être un entier de 1 à 365, l'objectif un entier strictement positif ; sinon message d'erreur et **aucun envoi**.
- La validation côté client est du **confort** (retour immédiat). La **sécurité**, c'est le serveur et la base : un client modifié qui enverrait 0 reçoit quand même 400.
- `parseCount(raw, max)` ([GradeBook.tsx:72](../../web/src/components/GradeBook.tsx#L72)) lit un champ entier : `undefined` s'il est vide, `null` s'il est invalide, sinon le nombre. Elle sert aux deux formulaires, pour l'objectif (jusqu'à `2^31 - 1`, la limite d'un `i32`) et la durée (jusqu'à 365).

### Régler le rattrapage d'une note existante

C'est le cas des notes déjà en base (par exemple Joshua et Pierre dans la démo).

1. **Bouton roue** ([GradeBook.tsx:377](../../web/src/components/GradeBook.tsx#L377)) : affiché à côté de chaque note **sous 10/20** (`on20(grade) < BAD`), hors saisie de colonne.
2. **Résumé** sous la note quand un réglage existe : « obj. 8 · 21 j » (`t.grades.goalShort`).
3. **Panneau** : `startGoal` ([GradeBook.tsx:202](../../web/src/components/GradeBook.tsx#L202)) ouvre un formulaire à deux champs, **prérempli** avec les valeurs actuelles venues de `GET /classes/{id}/grades`.
4. **Enregistrement** : `saveGoal` ([GradeBook.tsx:209](../../web/src/components/GradeBook.tsx#L209)) valide les deux champs, puis :
   - au moins un champ rempli → `PUT /grades/{id}/recovery-goal` avec `{ target, days }` (un champ vide vaut `undefined`, que `JSON.stringify` omet : le serveur le reçoit comme `None`) ;
   - les deux champs vides → `DELETE`, retour au plan par défaut.

   Puis message de confirmation et rechargement des notes (`onChanged`).

Le formulaire envoie toujours **les deux** valeurs : c'est cohérent avec le `PUT` qui remplace tout. Le formateur voit les valeurs actuelles préremplies, donc il ne risque pas d'effacer un objectif sans le voir.

## 6. Défense en profondeur : trois niveaux de validation

| Niveau | Où | Ce qu'il bloque |
|---|---|---|
| Interface | `GradeBook.tsx` | Objectif ou durée à 0, négatif, décimal, texte, durée au-delà de 365 ; champ objectif désactivé et bouton roue absent pour une bonne note |
| API | `grades.rs` | Mêmes valeurs (400), réglage sur une note sans plan (400), `PUT` vide (400), type invalide (422 par axum) |
| Base | `CHECK` sur `target`, `days` et ligne non vide, clé étrangère | Toute écriture, même hors application |

## 7. Tests

### Rust (`cargo test`, [xp.rs](../../backend/src/xp.rs))

14 tests : les 9 d'origine (inchangés, seul `plans_de_rattrapage` a reçu `target: None, days: None` dans ses `GradeRef`) et 5 nouveaux :

| Test | Ce qu'il prouve |
|---|---|
| `plan_avec_objectif` | Une note 7/20 avec objectif 8 donne un plan avec `target == Some(8)`. |
| `plan_sans_objectif` | Même note sans réglage : `target == None`, 14 jours. Non-régression. |
| `objectif_de_la_derniere_mauvaise_note` | 3 mauvaises notes : seule la plus récente compte, et à date égale la dernière de la liste. Teste aussi la casse. |
| `duree_personnalisee` | 21 jours : le plan est encore ouvert au jour 20, fermé au jour 22. 3 jours : déjà fermé au jour 4. |
| `duree_de_la_derniere_mauvaise_note` | Une ancienne note réglée sur 60 jours, une récente sans durée : le plan suit la récente, 14 jours. |

Ce sont des tests de **fonctions pures** : pas de base, pas de réseau, instantanés.

### Bout en bout (`backend/scripts/smoke.sh`)

25 vérifications ajoutées (53 au total, 0 échec).
- **Objectif** : 0 et négatif refusés, lot refusé sans aucune note créée, objectif sur 14/20 refusé, création nominale, affichage chez le formateur et chez l'élève, `PUT` (0, élève, autre formateur, note inconnue, bonne note, valeur valide), modification, réglages visibles dans la liste des notes, `DELETE`.
- **Durée** : 0 et 366 refusés, durée sur 12/20 refusée, plan de 30 jours avec date de fin exacte, `PUT` vide refusé, `PUT` durée 0 refusé, `PUT` durée seule (7 jours) qui raccourcit le plan et efface l'objectif.

Une fonction `status` a été ajoutée au script : `call` utilise `curl -f`, qui fait **échouer** le script sur une réponse 4xx. Pour tester un refus, on lit le code HTTP seul (`-w '%{http_code}'`).

### Vérification dans le navigateur

Parcours complet dans un navigateur automatisé, sur une copie de la base de démo :
- les roues apparaissent seulement pour Joshua et Pierre ;
- une durée de 0 affiche une erreur et rien n'est envoyé ;
- 8 et 21 enregistrés : le résumé « obj. 8 · 21 j » apparaît et le tableau de bord affiche « objectif : 8 bonnes réponses · sur 21 jours » ;
- en rouvrant le panneau, les champs sont préremplis ;
- en vidant les deux champs, les réglages sont retirés.

### Vérification des plans existants

1. Copie de la base de dev dans une base temporaire (pour ne pas toucher à tes données).
2. Ancien binaire : capture du JSON du tableau de bord (2 plans : Joshua et Pierre, Réseau, jusqu'au 25/10).
3. Nouveau binaire : migrations 0003 et 0004 appliquées, même capture.
4. `diff` : **identique** à l'exception des nouveaux champs `target` et `days`, qui valent `null` partout.

## 8. Questions pièges et réponses

### Sur la conception

**« Pourquoi ne pas avoir stocké les plans dans une table ? »**
Un plan dépend de toutes les notes de la matière et de la date du jour : le stocker obligerait à le recalculer à chaque saisie, suppression de note, et chaque jour qui passe (expiration). Le calcul à la lecture évite toute désynchronisation. Et la demande « durée » en a profité : une seule ligne de calcul à changer.

**« Pourquoi la durée est-elle par note et pas un réglage de la classe ? »**
Parce qu'un plan naît d'une note : le délai dépend de l'évaluation (un examen difficile mérite plus de temps qu'un petit contrôle) et parfois de l'élève. Un réglage par classe serait aussi possible, mais moins précis. L'interface simplifie en proposant une durée par saisie, appliquée à toute la colonne.

**« Pourquoi la même table pour l'objectif et la durée ? »**
Ce sont deux réglages du même plan, avec la même clé (la note), le même cycle de vie (supprimés avec la note) et les mêmes droits. Deux tables imposeraient deux jointures et deux routes pour la même chose.

**« Pourquoi borner la durée à 365 jours ? »**
Pour deux raisons. Métier : au-delà d'un an, ce n'est plus un rattrapage. Technique : `NaiveDate + Duration` **panique** si la date dépasse la limite de chrono (vers l'an 262 000). Sans borne, une durée de 2 milliards de jours ferait planter le traitement de la requête. La borne est vérifiée en Rust (400 propre) et en base (`CHECK`).

### Sur le comportement

**« Que se passe-t-il si le formateur supprime la note ? »**
`ON DELETE CASCADE` supprime ses réglages. Le plan est recalculé à partir des notes restantes : s'il reste une mauvaise note plus ancienne avec ses propres réglages, ce sont eux qui s'appliquent.

**« L'élève a deux mauvaises notes en Réseau, avec deux réglages différents. Lesquels s'appliquent ? »**
Ceux de la **plus récente**, pour l'objectif comme pour la durée. Ceux de l'ancienne restent en base mais ne sont pas utilisés. Le test `duree_de_la_derniere_mauvaise_note` le prouve : 60 jours sur l'ancienne, rien sur la récente, le plan dure 14 jours à partir de la récente.

**« Et deux mauvaises notes le même jour ? »**
La dernière saisie (`ORDER BY graded_on, created_at` + `max_by_key` qui garde le dernier maximum). Limite : deux notes saisies **dans la même requête** ont le même `created_at` (dans PostgreSQL, `now()` vaut l'heure de **début de la transaction**). Ce cas demande que le même élève apparaisse deux fois dans un même lot, ce que l'interface ne permet pas.

**« Je saisis une note datée d'il y a 20 jours avec une durée de 7 jours ? »**
C'est accepté : le plan est calculé comme fermé (date de fin dépassée), donc il n'apparaît pas. Ce n'est pas une erreur de saisie à proprement parler, juste un plan déjà terminé. On aurait pu le refuser ; ce n'était pas demandé.

**« Le formateur raccourcit un plan en cours : l'élève perd-il de l'XP ? »**
Non. Le dragon ne régresse jamais : l'XP déjà gagnée reste acquise. Le bonus s'arrête simplement plus tôt pour les quiz suivants.

**« La durée change-t-elle l'XP ? »**
Pas les règles de calcul, mais la **période** pendant laquelle le bonus de rattrapage s'applique. L'objectif, lui, est purement informatif.

**« Le plan est terminé : les réglages sont-ils supprimés ? »**
Non. Le plan disparaît de l'affichage, mais la ligne reste dans `recovery_goals`. Elle n'est simplement plus lue. Elle disparaît avec la note.

### Sur le code et la base

**« `CHECK (target > 0)` laisse passer `NULL` ? »**
Oui, et c'est voulu. En SQL, `NULL > 0` vaut `NULL` (inconnu), et un `CHECK` ne rejette que ce qui vaut `FALSE`. C'est pour ça qu'il a suffi de retirer le `NOT NULL` pour rendre l'objectif facultatif, et qu'il a fallu une contrainte à part (`recovery_goals_not_empty`) pour interdire une ligne entièrement vide.

**« J'envoie `PUT { "days": 7 }` sur une note qui avait un objectif de 8. Que devient l'objectif ? »**
Il est **effacé**. `PUT` remplace la ressource entière. Pour tout garder, il faut renvoyer `{ "target": 8, "days": 7 }`. Une mise à jour partielle correspondrait à `PATCH`, non demandé. Dans l'interface, ce piège n'existe pas : le panneau est prérempli avec les deux valeurs et les renvoie toutes les deux.

**« Comment le formateur règle-t-il une note déjà saisie ? »**
Avec la roue à côté de la note dans le carnet. L'interface lit les réglages actuels dans `GET /classes/{id}/grades` (nouveaux champs `recovery_target` et `recovery_days`), les préremplit, puis envoie `PUT`, ou `DELETE` si les deux champs sont vides.

**« Pourquoi la roue n'apparaît-elle pas sur une note de 12 ? »**
Parce qu'une note de 10 ou plus n'ouvre pas de plan : un réglage n'aurait pas de sens et le serveur le refuserait (400). La condition est la même que côté serveur : note ramenée sur 20 inférieure à 10.

**« La roue est affichée sur une ancienne mauvaise note dont le plan est fermé ? »**
Oui : l'interface ne recalcule pas les plans, elle regarde seulement la note. Régler une ancienne note est autorisé, mais sans effet visible tant qu'elle n'est pas la dernière mauvaise note de sa matière avec un plan en cours. C'est une limite connue.

**« Pourquoi `i32` et pas `u32`, puisque les valeurs sont positives ? »**
PostgreSQL n'a pas d'entier non signé : `integer` correspond à `i32`, et sqlx associe les deux directement. Et un `u32` ne rejetterait pas 0. Les règles sont donc vérifiées explicitement en Rust et par les `CHECK`.

**« Si j'envoie `"recovery_target": 8.5` ou `"8"` ? »**
Axum ne peut pas désérialiser le JSON vers `i32` : réponse **422** (Unprocessable Entity) avec le détail. C'est le comportement de toutes les routes du projet. Testé : 8.5, "8" et 3000000000 (dépasse `i32`) donnent 422.

**« Et `null` ? »**
`None`, exactement comme si le champ était absent.

**« Un autre formateur fait `PUT` sur ma note : pourquoi 404 et pas 403 ? »**
C'est le fonctionnement existant d'`owned_class` ([classes.rs:52](../../backend/src/routes/classes.rs#L52)) : pour un formateur qui n'est pas propriétaire, il répond « introuvable » afin de **ne pas révéler** que la ressource existe. Un élève reçoit 403, car `require_trainer` échoue avant.

**« Pourquoi vérifier les valeurs en Rust alors que la base a déjà des CHECK ? »**
Pour renvoyer un **400 avec un message clair**. Si seul le CHECK bloquait, sqlx remonterait une erreur de base, transformée en 500 « erreur interne » par `AppError::Db`. Les CHECK restent le filet de sécurité.

**« Pourquoi valider avant la transaction plutôt que dans la boucle ? »**
Les contrôles ne dépendent que des données reçues : inutile d'ouvrir une transaction et d'écrire pour ensuite tout annuler. Le résultat est le même (aucune donnée en cas d'erreur), sans travail inutile en base.

**« Que fait `EXCLUDED` ? »**
Dans `INSERT ... ON CONFLICT DO UPDATE`, `EXCLUDED` est la ligne qu'on a tenté d'insérer et qui est entrée en conflit. `SET target = EXCLUDED.target, days = EXCLUDED.days` remplace les anciennes valeurs par les nouvelles.

**« Que fait `map_or(RECOVERY_DAYS, i64::from)` ? »**
Sur un `Option<i32>` : `None` donne la valeur par défaut `RECOVERY_DAYS` (14) ; `Some(d)` donne `i64::from(d)`. `Duration::days` attend un `i64`, et la conversion `i32` vers `i64` ne peut pas échouer.

**« Les constantes sont-elles dupliquées ? »**
Oui, c'est une limite connue : le seuil de 10/20 (`BAD_GRADE_THRESHOLD` et `BAD`), la durée par défaut et le maximum (`RECOVERY_DAYS`, `RECOVERY_MAX_DAYS`) existent côté serveur et dans `GradeBook.tsx`. Si on les change d'un seul côté, l'interface sera incohérente, mais **le serveur reste la référence** et refusera toute valeur hors règle.

**« Comment prouvez-vous que les anciens plans n'ont pas changé ? »**
Trois preuves : le test `plan_sans_objectif` (14 jours, `None`), le smoke test (le plan « reseau » sans réglage reste `null`), et la comparaison avant/après migration sur la copie de la base de démo.

**« Comment montrer les contraintes au jury ? »**
Depuis le terminal : `docker exec -it slayyourenemies-bts-db-1 psql -U quiz -d quiz`, puis :
```sql
\d recovery_goals
INSERT INTO recovery_goals (grade_id, target) VALUES ((SELECT id FROM grades LIMIT 1), 0);
-- ERROR: ... violates check constraint "recovery_goals_target_check"
INSERT INTO recovery_goals (grade_id, days) VALUES ((SELECT id FROM grades LIMIT 1), 400);
-- ERROR: ... violates check constraint "recovery_goals_days_check"
INSERT INTO recovery_goals (grade_id) VALUES ((SELECT id FROM grades LIMIT 1));
-- ERROR: ... violates check constraint "recovery_goals_not_empty"
```

## 9. Limites à connaître

- Un seul réglage compte par plan : celui de la dernière mauvaise note de la matière.
- Les réglages disparaissent de l'affichage quand le plan se ferme, mais restent en base.
- `PUT` remplace objectif et durée ensemble (l'interface renvoie toujours les deux).
- La roue s'affiche sur toute note sous 10/20, même si son plan est fermé ou remplacé par une note plus récente.
- Constantes (seuil, durée par défaut, maximum) codées côté serveur et dans le carnet de notes.
- Pas de suivi de progression (« 3 sur 8 ») ni de récompense à l'objectif atteint : hors périmètre.
- Le test web `Layout.test.tsx` produit 2 erreurs non gérées (déjà présentes avant ces modifications, non corrigées ici) : les 12 tests passent mais `npm test` sort en échec.
- Le PDF `livrables/schema-sql.pdf` et l'image `docs/presentation/V4-schema-bdd.png` n'ont pas été régénérés : `livrables/schema.sql` et `docs/schema.dbml` sont à jour, et un diagramme ciblé est fourni (`docs/objectif-rattrapage/schema-suivi.png`).

## 10. Historique des commits

| Commit | Contenu |
|---|---|
| Migration 0003 | Table `recovery_goals` |
| Plans de rattrapage | `target` dans `GradeRef` et `RecoveryPlan`, jointures, tri, 3 tests Rust |
| Notes | `recovery_target` à la saisie, routes `PUT` et `DELETE` |
| Smoke test | 16 vérifications sur l'objectif |
| Suivi formateur | Affichage de l'objectif |
| Carnet de notes | Champ objectif à la saisie |
| Schéma SQL | `schema.sql` régénéré, `schema.dbml` |
| Documentation API | Objectif |
| Documentation | Guide, présentation, captures, schéma ciblé |
| Migration 0004 | Colonne `days`, `target` facultatif, contrainte de ligne non vide |
| Durée personnalisée | Calcul, saisie, `PUT`, `check_goal`, 2 tests Rust |
| Smoke test | 8 vérifications sur la durée |
| Interface | Champ durée et affichage sur le tableau de bord |
| Schéma SQL | `days` dans `schema.sql` et `schema.dbml` |
| Documentation API | Durée |
| Documentation | Guide et présentation pour la durée |
| Notes | La liste des notes renvoie `recovery_target` et `recovery_days`, 1 vérification smoke |
| Carnet de notes | Bouton roue et panneau de réglage d'une note existante |
| Documentation API | Champs de la liste des notes |
| Documentation | Ce guide et la présentation mis à jour |
