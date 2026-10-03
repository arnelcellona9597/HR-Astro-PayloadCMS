// Reading and writing individual Excel cells without losing accuracy.
import { isValidYmd } from '@hr/shared'
import type { CellValue } from 'exceljs'

const MS_PER_DAY = 86_400_000
// Excel's 1900 date system: serial 1 = 1900-01-01, and it wrongly treats 1900 as a leap year
// (serial 60 = the non-existent 1900-02-29). Counting from 1899-12-30 is correct for serials ≥ 61.
const EPOCH_1900 = Date.UTC(1899, 11, 30)
const EPOCH_1904 = Date.UTC(1904, 0, 1)

const pad = (n: number) => String(n).padStart(2, '0')
const utcYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** Unwraps rich text, formulas and hyperlinks to the plain value a person sees in the cell. */
export function plainValue(v: CellValue): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('')
    if ('result' in v) return plainValue((v as { result?: CellValue }).result ?? null)
    if ('text' in v) return String((v as { text: unknown }).text ?? '')
    if ('error' in v) return null
  }
  return null
}

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/** Text as typed. Whole numbers are written without decimals (Excel may store "12345" as a number). */
export function cellText(v: unknown): string | null {
  if (isBlank(v)) return null
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  if (v instanceof Date) return utcYmd(v)
  return String(v).replace(/\s+/g, ' ').trim()
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export type DateResult = { ok: true; ymd: string } | { ok: false; error: string }

/**
 * Reads a date cell. Accepts real Excel dates, date serial numbers, `YYYY-MM-DD` / `YYYY/MM/DD`
 * text and unambiguous month-name text ("Mar 5, 2024", "5 March 2024"). Text like 03/05/2024 is
 * rejected because it could mean March 5 or May 3.
 */
export function cellDate(v: unknown, date1904 = false): DateResult {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ok: false, error: 'is not a valid date' }
    // exceljs returns date cells as UTC midnight of the shown date; tolerate small time parts.
    return { ok: true, ymd: utcYmd(new Date(v.getTime() + 60_000)) }
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 1 || v > 2_958_465) return { ok: false, error: `(${v}) is not a valid date` }
    if (!date1904 && v === 60) return { ok: false, error: 'is 1900-02-29, which does not exist' }
    const serial = !date1904 && v < 60 ? v + 1 : v
    const ms = (date1904 ? EPOCH_1904 : EPOCH_1900) + Math.floor(serial) * MS_PER_DAY
    return { ok: true, ymd: utcYmd(new Date(ms)) }
  }
  const s = String(v ?? '').trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (m) {
    const ymd = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
    return isValidYmd(ymd) ? { ok: true, ymd } : { ok: false, error: `"${s}" is not a real date` }
  }
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s) // Mar 5, 2024
  if (m) {
    const mo = MONTHS.indexOf(m[1]!.toLowerCase()) + 1
    const ymd = `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}`
    if (mo > 0 && isValidYmd(ymd)) return { ok: true, ymd }
  }
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(s) // 5 March 2024
  if (m) {
    const mo = MONTHS.indexOf(m[2]!.toLowerCase()) + 1
    const ymd = `${m[3]}-${pad(mo)}-${pad(Number(m[1]))}`
    if (mo > 0 && isValidYmd(ymd)) return { ok: true, ymd }
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) {
    return { ok: false, error: `"${s}" is ambiguous (day/month order). Use YYYY-MM-DD or an Excel date cell` }
  }
  return { ok: false, error: `"${s}" is not a recognised date. Use YYYY-MM-DD` }
}

/** `YYYY-MM-DD` → a Date that exceljs writes as exactly that calendar day. */
export function ymdToExcelDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

/** Normalizes header text for matching: case, spacing and punctuation spacing don't matter. */
export function headerKey(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s*([/.()-])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
