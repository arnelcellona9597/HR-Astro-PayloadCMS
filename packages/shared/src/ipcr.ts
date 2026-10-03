// CSC Strategic Performance Management System (SPMS) adjectival rating scale.
export const IPCR_SCALE = [
  { min: 4.5, label: 'Outstanding' },
  { min: 3.5, label: 'Very Satisfactory' },
  { min: 2.5, label: 'Satisfactory' },
  { min: 1.5, label: 'Unsatisfactory' },
  { min: 1, label: 'Poor' },
] as const

export const IPCR_MIN = 1
export const IPCR_MAX = 5

/** Rounds to 3 decimals the way IPCR forms report ratings. */
export function roundRating(rating: number): number {
  return Math.round(rating * 1000) / 1000
}

export function adjectivalRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return ''
  const r = roundRating(rating)
  if (r < IPCR_MIN || r > IPCR_MAX) return ''
  return IPCR_SCALE.find((s) => r >= s.min)!.label
}
