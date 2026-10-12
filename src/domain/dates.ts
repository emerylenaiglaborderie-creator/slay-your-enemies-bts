export const DAY_MS = 24 * 60 * 60 * 1000

/** Minuit local du jour contenant `time`. */
export function startOfDay(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Ajoute des jours calendaires (robuste aux changements d'heure). */
export function addDays(time: number, days: number): number {
  const d = new Date(time)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** Nombre de jours calendaires entre deux instants (b - a). */
export function diffDays(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

/** Valeur d'un <input type="date"> (AAAA-MM-JJ) pour un instant donné. */
export function toDateInput(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Minuit local de la date AAAA-MM-JJ, ou null si la saisie est invalide. */
export function fromDateInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}
