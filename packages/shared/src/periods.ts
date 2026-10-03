// Reporting periods for the dashboard: a date range, the equal-length range before it (for
// "vs previous period" changes) and how to group the range into chart buckets. All dates are
// `YYYY-MM-DD` in Manila time, like every other HR date.
import { addDays, addYears, todayYmd } from './dates'
import { dayOfWeek } from './workdays'

export const PERIODS = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'this-year', label: 'This year' },
  { key: '12m', label: 'Last 12 months' },
  { key: '10y', label: 'Last 10 years' },
] as const

export type PeriodKey = (typeof PERIODS)[number]['key']
export type Bucket = 'day' | 'week' | 'month' | 'year'
export const DEFAULT_PERIOD: PeriodKey = 'this-year'

export type Period = {
  key: PeriodKey
  label: string
  from: string
  to: string
  prevFrom: string
  prevTo: string
  /** How the comparison is described, e.g. "vs same period last year". */
  prevLabel: string
  bucket: Bucket
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function isPeriodKey(v: unknown): v is PeriodKey {
  return PERIODS.some((p) => p.key === v)
}

const pad = (n: number) => String(n).padStart(2, '0')
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`
function monthEnd(ymd: string): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}
/** Adds whole months, clamping the day to the target month's length (Mar 31 − 1 month = Feb 28/29). */
export function addMonths(ymd: string, months: number): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7)) - 1 + months
  const d = Number(ymd.slice(8, 10))
  const ty = y + Math.floor(m / 12)
  const tm = ((m % 12) + 12) % 12
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`
}

export function resolvePeriod(key: PeriodKey = DEFAULT_PERIOD, today: string = todayYmd()): Period {
  const label = PERIODS.find((p) => p.key === key)!.label
  const year = Number(today.slice(0, 4))
  switch (key) {
    case 'this-month': {
      const from = monthStart(today)
      const prevFrom = addMonths(from, -1)
      return { key, label, from, to: today, prevFrom, prevTo: addMonths(today, -1), prevLabel: 'vs same days last month', bucket: 'day' }
    }
    case 'last-month': {
      const from = addMonths(monthStart(today), -1)
      const prevFrom = addMonths(from, -1)
      return { key, label, from, to: monthEnd(from), prevFrom, prevTo: monthEnd(prevFrom), prevLabel: 'vs the month before', bucket: 'day' }
    }
    case '90d': {
      const from = addDays(today, -89)
      return { key, label, from, to: today, prevFrom: addDays(from, -90), prevTo: addDays(from, -1), prevLabel: 'vs previous 90 days', bucket: 'week' }
    }
    case '12m': {
      const from = addMonths(monthStart(today), -11)
      return { key, label, from, to: today, prevFrom: addMonths(from, -12), prevTo: addDays(from, -1), prevLabel: 'vs previous 12 months', bucket: 'month' }
    }
    case '10y': {
      return {
        key,
        label,
        from: `${year - 9}-01-01`,
        to: today,
        prevFrom: `${year - 19}-01-01`,
        prevTo: `${year - 10}-12-31`,
        prevLabel: 'vs previous 10 years',
        bucket: 'year',
      }
    }
    default: {
      return {
        key: 'this-year',
        label: 'This year',
        from: `${year}-01-01`,
        to: today,
        prevFrom: `${year - 1}-01-01`,
        prevTo: addYears(today, -1),
        prevLabel: 'vs same period last year',
        bucket: 'month',
      }
    }
  }
}

/** The bucket a date falls in: the day, the Monday of its week, `YYYY-MM` or `YYYY`. */
export function bucketKey(ymd: string, bucket: Bucket): string {
  if (bucket === 'day') return ymd
  if (bucket === 'week') return addDays(ymd, -((dayOfWeek(ymd) + 6) % 7))
  if (bucket === 'month') return ymd.slice(0, 7)
  return ymd.slice(0, 4)
}

/** Every bucket from `from` to `to`, in order, with a short chart label. */
export function bucketsFor(from: string, to: string, bucket: Bucket): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const multiYear = from.slice(0, 4) !== to.slice(0, 4)
  let cur = bucket === 'month' ? monthStart(from) : bucket === 'year' ? `${from.slice(0, 4)}-01-01` : bucketKey(from, bucket)
  const end = bucketKey(to, bucket)
  for (let guard = 0; guard < 400; guard++) {
    const key = bucketKey(cur, bucket)
    if (key > end) break
    const m = MONTHS[Number(cur.slice(5, 7)) - 1]
    const label =
      bucket === 'year'
        ? cur.slice(0, 4)
        : bucket === 'month'
          ? multiYear
            ? `${m} ’${cur.slice(2, 4)}`
            : m!
          : `${m} ${Number(cur.slice(8, 10))}`
    out.push({ key, label })
    cur = bucket === 'day' ? addDays(cur, 1) : bucket === 'week' ? addDays(cur, 7) : bucket === 'month' ? addMonths(cur, 1) : `${Number(cur.slice(0, 4)) + 1}-01-01`
  }
  return out
}

/** Percentage change from `prev` to `cur`; null when there is no earlier value to compare with. */
export function percentChange(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / prev) * 100
}
