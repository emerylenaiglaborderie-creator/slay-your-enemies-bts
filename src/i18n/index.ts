import { fr } from './fr'

/** Textes de l'interface. Une autre langue devra respecter le type `Messages`. */
export const t = fr

export function formatDate(time: number): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(time)
}
