export { formatDate, formatNameLastFirst, toYmd } from '@hr/shared'

const NUM = new Intl.NumberFormat('en-US')
export const fmtNum = (n: number | null | undefined) => (n == null ? '' : NUM.format(n))

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

export function relId(v: unknown): number | null {
  if (v && typeof v === 'object' && 'id' in (v as object)) return (v as { id: number }).id
  return typeof v === 'number' ? v : null
}

export function relName(v: unknown, key = 'name'): string {
  return v && typeof v === 'object' ? String((v as Record<string, unknown>)[key] ?? '') : ''
}

/** Value of a field as a string for <input value>. Dates become YYYY-MM-DD. */
export function inputValue(v: unknown, kind?: string): string {
  if (v == null) return ''
  if (kind === 'date') return typeof v === 'string' ? v.slice(0, 10) : ''
  if (typeof v === 'object' && 'id' in (v as object)) return String((v as { id: number }).id)
  return String(v)
}

export function statusBadge(status: string | null | undefined): string {
  switch (status) {
    case 'Active':
    case 'Approved':
    case 'Complete':
    case 'Hired':
    case 'approved':
    case 'Submitted':
    case 'Verified':
      return 'badge-success'
    case 'Pending':
    case 'pending':
    case 'For Interview':
    case 'For OJT':
    case 'Incomplete':
      return 'badge-warning'
    case 'Terminated':
    case 'Disapproved':
    case 'Not Hired':
    case 'disabled':
      return 'badge-danger'
    default:
      return 'badge-neutral'
  }
}
