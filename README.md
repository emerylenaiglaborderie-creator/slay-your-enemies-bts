# Slay your enemies (projet BTS)

Copie du projet personnel Slay your enemies, servant de base au projet de BTS. Elle a sa propre base de données locale (`slay-your-enemies-bts`) et ses propres ports (5174 en développement, 4174 en preview) pour pouvoir tourner à côté de l'original.

Application web personnelle de révision avec compagnon virtuel. Le brief complet est dans [PROJET.md](PROJET.md).

## Commandes

```sh
npm install
npm run dev        # serveur de développement
npm test           # tests Vitest
npm run typecheck  # vérification TypeScript
npm run build      # build de production
```

## Organisation

- `src/domain/` : logique pure et testée (répétition espacée, import Markdown, textes à trous, file de révision)
- `src/storage/` : abstraction de stockage et implémentation Dexie (IndexedDB)
- `src/stores/` : état Zustand, seul point d'accès au stockage pour l'interface
- `src/i18n/` : textes de l'interface
- `src/reminders/` et `src/sw.ts` : rappels de révision et service worker (hors ligne, notifications)
- `src/styles/tokens.css` : design tokens (thème sombre par défaut)

## Rappels et hors ligne

L'app est une PWA : elle fonctionne hors ligne et peut être installée. Les rappels ne sont testables qu'avec le build de production (`npm run build && npm run preview`), le service worker n'étant pas actif en développement. Sans serveur, le rappel part quand l'app est ouverte ; app fermée, seuls Chrome et Edge (app installée) peuvent l'envoyer, à un moment choisi par le navigateur.
