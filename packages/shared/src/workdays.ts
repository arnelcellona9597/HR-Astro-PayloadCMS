import { addDays, isValidYmd } from './dates'

/** Day of week for a `YYYY-MM-DD` date: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

export type WorkdayCount = {
  /** Total working days in the range. */
  total: number
  /** Working days per calendar year (a Dec–Jan leave is charged to both years). */
  byYear: Record<number, number>
  /** The individual working dates counted. */
  dates: string[]
}

const MAX_RANGE_DAYS = 366

/**
 * Counts Monday–Friday dates in the inclusive range `from`..`to`, skipping `holidays`.
 * Throws on invalid input so a bad date can never silently count as zero days.
 */
export function countWorkdays(from: string, to: string, holidays: Iterable<string> = []): WorkdayCount {
  if (!isValidYmd(from) || !isValidYmd(to)) throw new Error('Invalid date range')
  if (to < from) throw new Error('The end date is before the start date')
  const skip = new Set(holidays)
  const result: WorkdayCount = { total: 0, byYear: {}, dates: [] }
  let cur = from
  for (let i = 0; cur <= to; i++) {
    if (i > MAX_RANGE_DAYS) throw new Error('Leave range is longer than a year')
    const dow = dayOfWeek(cur)
    if (dow !== 0 && dow !== 6 && !skip.has(cur)) {
      const year = Number(cur.slice(0, 4))
      result.total++
      result.byYear[year] = (result.byYear[year] ?? 0) + 1
      result.dates.push(cur)
    }
    cur = addDays(cur, 1)
  }
  return result
}
