// Date-only handling for HR data.
//
// HR dates (birthdays, hire dates, leave dates) have no time of day. To keep them from shifting by a
// day between Manila (UTC+8) and UTC, every date-only value is stored as `YYYY-MM-DDT12:00:00.000Z`
// and every comparison is done on the `YYYY-MM-DD` part. "Today" is always today in Asia/Manila.

export const TIMEZONE = 'Asia/Manila'

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True when `ymd` is a real calendar date in `YYYY-MM-DD` form (rejects 2023-02-29 etc.). */
export function isValidYmd(ymd: string): boolean {
  const m = YMD_RE.exec(ymd)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || y > 2200) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** Today's date in Manila as `YYYY-MM-DD`. */
export function todayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Converts anything date-like to `YYYY-MM-DD`, or null when empty/invalid.
 * - `YYYY-MM-DD` strings are taken as-is.
 * - Full ISO strings / Date objects are read in Manila time, so a value saved as midnight Manila
 *   (`...T16:00:00Z` the previous day) still yields the intended date.
 */
export function toYmd(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (YMD_RE.test(trimmed)) return isValidYmd(trimmed) ? trimmed : null
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? null : todayYmd(parsed)
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : todayYmd(value)
  }
  return null
}

/** `YYYY-MM-DD` → the canonical stored ISO string (noon UTC). */
export function ymdToStored(ymd: string): string {
  return `${ymd}T12:00:00.000Z`
}

/** Normalizes any date-like value to the canonical stored ISO string, or null. */
export function normalizeDateOnly(value: unknown): string | null {
  const ymd = toYmd(value)
  return ymd ? ymdToStored(ymd) : null
}

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number)
  return [y!, m!, d!]
}

/** Whole years between `birth` and `on` (both `YYYY-MM-DD`). Feb-29 birthdays age on Mar-1 in common years. */
export function ageOn(birth: string, on: string = todayYmd()): number | null {
  if (!isValidYmd(birth) || !isValidYmd(on) || on < birth) return null
  const [by, bm, bd] = parts(birth)
  const [oy, om, od] = parts(on)
  let age = oy - by
  if (om < bm || (om === bm && od < bd)) age--
  return age
}

export type Span = { years: number; months: number; days: number }

function addMonthsClamped(ymd: string, months: number): string {
  const [y, m, d] = parts(ymd)
  const total = y * 12 + (m - 1) + months
  const ty = Math.floor(total / 12)
  const tm = (total % 12) + 1
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Calendar difference between two dates (`from` ≤ `to`), as years/months/days. */
export function diffYmd(from: string, to: string): Span | null {
  if (!isValidYmd(from) || !isValidYmd(to) || to < from) return null
  const [fy, fm, fd] = parts(from)
  const [ty, tm, td] = parts(to)
  let months = (ty - fy) * 12 + (tm - fm)
  if (td < fd) months--
  // Step back if clamping (e.g. Jan 31 + 1 month = Feb 29) overshoots `to`
  while (months > 0 && addMonthsClamped(from, months) > to) months--
  const days = daysBetween(addMonthsClamped(from, months), to)
  return { years: Math.floor(months / 12), months: months % 12, days }
}

/** Length of service from hire date to last day of service (if separated) or today. */
export function lengthOfService(
  dateHired: string | null | undefined,
  lastDayOfService?: string | null,
  today: string = todayYmd(),
): Span | null {
  if (!dateHired) return null
  const end = lastDayOfService && lastDayOfService < today ? lastDayOfService : today
  return diffYmd(dateHired, end)
}

export function formatSpan(span: Span | null): string {
  if (!span) return ''
  const p: string[] = []
  if (span.years) p.push(`${span.years} yr${span.years === 1 ? '' : 's'}`)
  if (span.months) p.push(`${span.months} mo${span.months === 1 ? '' : 's'}`)
  if (!span.years && !span.months) p.push(`${span.days} day${span.days === 1 ? '' : 's'}`)
  return p.join(' ')
}

/** Total length of service in fractional years, for range filters and sorting. */
export function spanToYears(span: Span | null): number | null {
  return span ? span.years + span.months / 12 + span.days / 365 : null
}

/** Adds whole years to a date (used to turn an age range into a date-of-birth range). */
export function addYears(ymd: string, years: number): string {
  const [y, m, d] = parts(ymd)
  const ty = y + years
  // Clamp Feb-29 to Feb-28 in non-leap target years
  const lastDay = new Date(Date.UTC(ty, m, 0)).getUTCDate()
  return `${ty}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = parts(ymd)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const DISPLAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

/** `2024-03-05` → `Mar 5, 2024` (empty string for empty input). */
export function formatDate(value: unknown): string {
  const ymd = toYmd(value)
  return ymd ? DISPLAY.format(new Date(ymdToStored(ymd))) : ''
}

export function yearOf(value: unknown): number | null {
  const ymd = toYmd(value)
  return ymd ? Number(ymd.slice(0, 4)) : null
}
