# Révision avec compagnon virtuel : brief de projet

Ce fichier est le point de départ pour Claude Code. Lis-le en entier avant d'écrire du code, puis suis la section "Premières tâches".

## 1. Vision

Application web personnelle de révision. L'utilisateur importe ses cours, crée ses fiches à la main (avec des suggestions issues de l'analyse du cours), révise, et fait grandir un animal de compagnie virtuel grâce à sa régularité et à ses résultats.

Principes directeurs :
- Création manuelle des fiches : l'analyse automatique propose, l'utilisateur valide, modifie ou rejette.
- Les rappels de révision sont calculés à rebours depuis la prochaine échéance (contrôle, examen).
- L'animal récompense la régularité et la maîtrise, jamais le volume brut. Il ne régresse jamais et ne tombe jamais malade (pas de mécanique punitive).
- Usage perso d'abord : pas de comptes ni de backend dans la V1.

## 2. Stack

- React 18 + Vite + TypeScript (composants fonctionnels et hooks)
- Zustand pour l'état, React Router pour la navigation
- Tailwind CSS avec des design tokens (voir section DA)
- Stockage local : IndexedDB via Dexie (local-first, tout fonctionne hors ligne)
- PWA (vite-plugin-pwa) pour permettre les notifications de rappel
- Parsing Markdown : `markdown-it`
- Tests : Vitest pour la logique métier (répétition espacée, XP), React Testing Library pour les composants clés
- Animations : CSS en priorité, Framer Motion (ou `motion`) pour le retournement de carte et les effets d'XP
- Pas de Firebase en V1. Prévoir une couche `storage/` abstraite pour pouvoir brancher une synchro plus tard.

## 3. Fonctionnalités

### V1 (base)
1. Import d'un cours `.md`, découpage par chapitre/partie, titre éditable, rangement par matière
2. Création manuelle de fiches rattachées à un cours : flashcard, texte à trous, question de quiz
3. Mode révision (flashcards, textes à trous, quiz)
4. Répétition espacée simple (SM-2 simplifié)
5. Échéances (date, type, matière) qui plafonnent les intervalles de révision

### V2
6. Animal de compagnie : XP par session, niveaux, évolutions
7. Saisie des notes (matière, valeur, coefficient, date) avec effet sur l'animal (bonus de progression, plan de rattrapage après une mauvaise note)
8. Rappels (notifications PWA) : "X fiches à réviser aujourd'hui"

### V3
9. Suggestions automatiques après analyse d'un cours (candidats de fiches, de trous, de questions)
10. Banque de fiches/réponses globale pour piocher les mauvaises réponses des quiz et textes à trous
11. Import d'images avec les cours

## 4. Modèle de données

```ts
type Subject  = { id: string; name: string; color: string }
type Course   = { id: string; subjectId: string; title: string; markdown: string; createdAt: number }
type Deadline = { id: string; subjectId: string; type: 'controle' | 'examen' | 'projet'; date: number; courseIds: string[] }

type CardType = 'flashcard' | 'cloze' | 'quiz'
type Card = {
  id: string
  courseId: string
  type: CardType
  front: string            // question, ou texte avec trous marqués {{...}}
  back: string             // réponse
  choices?: string[]       // pour quiz : mauvaises réponses
  createdAt: number
}

type Review = {
  id: string
  cardId: string
  date: number
  result: 'again' | 'hard' | 'good' | 'easy'
  nextDue: number
  interval: number         // en jours
  ease: number
}

type Grade = { id: string; subjectId: string; value: number; max: number; coef: number; date: number }

type Pet = { id: string; species: string; name: string; xp: number; level: number; stage: number; streak: number }
```

## 5. Règles métier clés

### Répétition espacée
- SM-2 simplifié : intervalle de départ 1 jour, multiplié par `ease` après une bonne réponse, remis à 1 jour après `again`.
- Plafond d'échéance : si une échéance est liée à la fiche, `nextDue` ne doit jamais dépasser la date de l'échéance moins 1 jour. Plus l'échéance approche, plus les intervalles se resserrent (répartir au moins 3 révisions avant la date quand c'est possible).
- Fonction pure et testée : `computeNextReview(review, result, deadline?) => Review`.

### XP et croissance de l'animal
- XP gagnée par session = base fixe + bonus de maîtrise (fiches passées de "again" à "good"), avec plafond quotidien pour éviter le grind.
- Le streak donne un multiplicateur léger, mais une journée manquée remet le streak à zéro sans aucune pénalité sur l'XP ou le niveau.
- Mauvaise note : l'animal ne change pas de niveau, un "plan de rattrapage" apparaît et donne un bonus d'XP sur les fiches de la matière concernée.
- Bonne note : bonus d'XP ponctuel.
- Les stades sont définis dans un fichier de config (`domain/pet-stages.ts`) sous la forme `{ id, minLevel, sprite }`. Le stade courant se déduit du niveau. Ajouter un stade ne doit demander que l'ajout d'une entrée dans ce fichier et d'un sprite.

## 6. Direction artistique (validée)

- Compagnon : un dragon, pixel art, sprites dessinés en 32x32 et affichés en x4 avec `image-rendering: pixelated`. Grille de 8 px pour l'UI.
- Ambiance : nocturne et cosy, violet profond, pas gamifiée à outrance. L'interface de révision reste sobre pour ne pas distraire : seul le dragon et les accents donnent de la personnalité.
- Thème : sombre par défaut (classe `dark` posée sur `<html>` au démarrage). Le thème clair est optionnel et viendra plus tard, mais tous les tokens sont des variables CSS pour que ce soit simple à ajouter.
- Palette : à déclarer comme variables CSS exposées à Tailwind (bloc `@theme` en Tailwind v4), jamais de couleur en dur dans les composants.

```css
/* Thème sombre (défaut) */
--color-bg:          #14101F;  /* fond de l'app */
--color-surface:     #1E1830;  /* cartes, panneaux */
--color-surface-2:   #2A2142;  /* éléments surélevés, survol */
--color-border:      #3A2F5C;
--color-ink:         #EDE7F6;  /* texte principal */
--color-ink-muted:   #B3A6D1;  /* texte secondaire */

--color-accent:      #7E57C2;  /* deep purple : boutons, éléments actifs */
--color-accent-strong: #5E35B1; /* survol, appui */
--color-accent-soft: #B39DDB;  /* texte et icônes d'accent sur fond sombre */

--color-xp:          #FFB74D;  /* XP, streak, flamme du dragon */
--color-success:     #7BC47F;
--color-warning:     #FFB74D;
--color-danger:      #E0707A;
```

  - Règle de contraste : `accent` sert pour les fonds de boutons avec texte blanc ou pour les éléments non textuels. Pour du texte ou de petites icônes d'accent sur fond sombre, utiliser `accent-soft`.
  - Une couleur par matière pour les badges et barres de progression : teal #4DB6AC, rose #F06292, bleu #64B5F6, vert #81C784, orange #FF8A65, jaune #FFD54F.
  - Palette du dragon (12 couleurs maximum pour garder un pixel art cohérent) : contour #000000 (noir pur, comme dans les sprites actuels), corps #3B2478 / #5E35B1 / #7E57C2 / #B39DDB, ventre #E1D4F7 et #C3AEE8, cornes et griffes #FFD54F et #C99A1E, yeux et flamme #FFB74D et #FF8A65, reflet #FFF3C4.
- Typographies : Pixelify Sans pour les titres, les niveaux et les éléments de jeu (plus lisible que Press Start 2P), Inter pour le contenu des cours et des fiches. Les installer via Fontsource pour qu'elles marchent hors ligne.
- Animations : légères (respiration de l'animal, apparition de XP), respecter `prefers-reduced-motion`.
- Accessibilité : contraste AA minimum, tailles de texte lisibles pour la révision, navigation clavier complète en mode révision.

### Éléments graphiques à produire
1. Dragon, 3 stades pour l'instant (seuils de départ, à ajuster) :
   - Oeuf, niveaux 1 à 4 : violet avec une fissure dorée en zigzag et des reflets lilas
   - Bébé, niveaux 5 à 14 : éclosion au niveau 5, petit corps, cornes dorées, yeux orange, ventre lilas
   - Jeune, niveaux 15 et plus : ailes, cornes dorées, queue, silhouette de dragon (stade final pour l'instant)
   - Un stade adulte pourra être ajouté plus tard : ne pas le coder, mais prévoir l'architecture pour (voir section 5)
   - Sprites existants (déjà dessinés, à placer dans `src/assets/pixel/`) : `dragon-egg.png`, `dragon-baby.png`, `dragon-young.png`, une image statique par stade.
   - Animation à ajouter plus tard : états idle (respiration), content, célébration, sommeil (jamais malade ni triste), plus l'éclosion et le changement de stade. Format prévu : une spritesheet PNG par stade et par état, 4 frames, animée en CSS avec `steps()`.
   - En attendant, animer les images statiques en CSS (léger mouvement vertical pour l'idle, rebond pour la célébration).
   - Afficher le sprite sur un panneau `surface-2` (#2A2142) : le contour noir se fondrait dans le fond de l'app (#14101F).
2. Barre d'XP et badge de niveau
3. Carte de flashcard (recto/verso, animation de retournement)
4. Composant texte à trous (trou vide, trou rempli bon/faux)
5. Boutons de réponse de révision (À revoir, Difficile, Bien, Facile)
6. Icônes de navigation (cours, fiches, réviser, notes, animal), style pixel
7. Badges de matière colorés
8. Indicateur de streak
9. Carte d'échéance avec compte à rebours
10. États vides illustrés (aucun cours, aucune fiche à réviser)

## 7. Structure du projet

```
src/
  components/      # composants UI réutilisables
  pages/           # pages (Courses, Cards, Review, Grades, Pet, Settings)
  hooks/           # hooks personnalisés (useDueCards, usePet, ...)
  stores/          # Zustand (courses, cards, reviews, deadlines, grades, pet)
  domain/          # logique pure et testée (spaced-repetition.ts, xp.ts, markdown-import.ts)
  storage/         # abstraction + implémentation Dexie
  assets/pixel/    # sprites et icônes
  styles/          # tokens, thème clair/sombre
```

## 8. Conventions

- TypeScript strict, pas de `any`.
- La logique métier vit dans `domain/`, sans dépendance à React, avec tests Vitest.
- Pas de `useEffect` pour dériver de l'état : calculer pendant le rendu ou dans le store.
- Les composants ne touchent jamais Dexie directement : tout passe par `storage/` puis les stores.
- Commits petits et atomiques, messages en français à l'impératif.
- Pas de tirets cadratins dans les textes de l'interface ni dans la documentation.
- Textes de l'interface en français, centralisés dans un fichier de traductions pour permettre l'anglais plus tard.

## 9. Premières tâches (dans cet ordre)

1. Initialiser le projet Vite + React + TypeScript, installer Tailwind, Zustand, React Router, Dexie, Vitest.
2. Mettre en place les design tokens (couleurs, polices, espacements) avec le thème sombre par défaut.
3. Créer la couche `storage/` (Dexie) avec les tables Subject, Course, Card, Review, Deadline, Grade, Pet.
4. Implémenter l'import d'un cours `.md` avec découpage par titres et édition du titre.
5. Créer le CRUD des fiches (flashcard, texte à trous avec syntaxe `{{réponse}}`, quiz).
6. Écrire `computeNextReview` avec ses tests, puis le mode révision.
7. S'arrêter ici et me demander validation avant d'attaquer l'échéance, l'animal et les notes.

Ne rien implémenter de la V2 ou V3 sans demande explicite.
