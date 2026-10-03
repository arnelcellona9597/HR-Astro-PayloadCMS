// Peso amounts are handled as whole centavos (integers) so totals never pick up floating-point
// errors like 0.1 + 0.2 = 0.30000000000000004.

export const MAX_AMOUNT_CENTAVOS = 100_000_000_000 // ₱1 billion

export type MoneyResult = { ok: true; centavos: number } | { ok: false; error: string }

/** Parses 1234.5, "1,234.50", "₱ 1,234.50" or "PHP 1234" into centavos. Rejects negatives and >2 decimals. */
export function toCentavos(value: unknown): MoneyResult {
  if (value === null || value === undefined || value === '') return { ok: true, centavos: 0 }
  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { ok: false, error: 'is not a number' }
    // Numbers from forms/Excel: round to 2 decimals only if they are already within half a centavo.
    text = String(value)
  } else {
    text = String(value).trim().replace(/^(₱|php|p)\s*/i, '').replace(/,/g, '')
  }
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text)) return { ok: false, error: `"${String(value)}" is not an amount` }
  const n = Number(text)
  if (n < 0) return { ok: false, error: 'cannot be negative' }
  const centavos = Math.round(n * 100)
  if (Math.abs(n * 100 - centavos) > 1e-6) return { ok: false, error: 'can have at most 2 decimal places' }
  if (centavos > MAX_AMOUNT_CENTAVOS) return { ok: false, error: 'is too large' }
  return { ok: true, centavos }
}

export const fromCentavos = (centavos: number) => centavos / 100

export function sumCentavos(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

const FMT = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 123456 → "₱1,234.56" (negative amounts shown as −₱…). */
export function formatCentavos(centavos: number, symbol = '₱'): string {
  const sign = centavos < 0 ? '−' : ''
  return `${sign}${symbol}${FMT.format(Math.abs(centavos) / 100)}`
}

/** A peso amount (number) → "₱1,234.56". */
export function formatPeso(amount: number | null | undefined, symbol = '₱'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return ''
  return formatCentavos(Math.round(amount * 100), symbol)
}
