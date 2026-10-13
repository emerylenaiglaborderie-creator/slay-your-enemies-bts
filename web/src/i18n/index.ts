import { fr } from './fr'

/** Textes de l'interface. Une autre langue devra respecter le type `Messages`. */
export const t = fr

/** Date AAAA-MM-JJ de l'API, lue en heure locale. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseDay(iso))
}

/** Jours calendaires d'aujourd'hui à la date (0 le jour même, négatif si passée). */
export function daysUntil(iso: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((parseDay(iso).getTime() - today.getTime()) / 86_400_000)
}

/** Date du jour au format AAAA-MM-JJ, pour les champs date. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
