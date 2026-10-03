// Philippine government ID numbers. Values are kept as text (never numbers) so leading zeros
// survive, and are stored in one canonical dashed format so searching and de-duplication work.

type IdSpec = {
  label: string
  /** Allowed digit counts. */
  lengths: number[]
  /** Dash grouping per digit count, e.g. [2, 7, 1] → 12-3456789-0 */
  groups: Record<number, number[]>
}

export const ID_SPECS = {
  sss: { label: 'SSS Number', lengths: [10], groups: { 10: [2, 7, 1] } },
  pagibig: { label: 'Pag-IBIG Number', lengths: [12], groups: { 12: [4, 4, 4] } },
  philhealth: { label: 'PhilHealth Number', lengths: [12], groups: { 12: [2, 9, 1] } },
  // 9-digit TIN, optionally followed by a 3- or 5-digit branch code
  tin: {
    label: 'TIN Number',
    lengths: [9, 12, 14],
    groups: { 9: [3, 3, 3], 12: [3, 3, 3, 3], 14: [3, 3, 3, 5] },
  },
} satisfies Record<string, IdSpec>

export type IdKind = keyof typeof ID_SPECS

const ALLOWED_CHARS = /^[\d\s\-.]+$/

/** Returns an error message, or null when the value is empty or valid. */
export function validateGovId(kind: IdKind, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const spec: IdSpec = ID_SPECS[kind]
  const str = String(value).trim()
  if (!ALLOWED_CHARS.test(str)) return `${spec.label} may only contain digits and dashes`
  const digits = str.replace(/\D/g, '')
  if (!spec.lengths.includes(digits.length)) {
    return `${spec.label} must have ${spec.lengths.join(' or ')} digits (got ${digits.length})`
  }
  return null
}

/** Canonical dashed form, or the trimmed input unchanged when it isn't valid. */
export function formatGovId(kind: IdKind, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (validateGovId(kind, str)) return str
  const digits = str.replace(/\D/g, '')
  const groups = (ID_SPECS[kind] as IdSpec).groups[digits.length]!
  const out: string[] = []
  let i = 0
  for (const g of groups) {
    out.push(digits.slice(i, i + g))
    i += g
  }
  return out.join('-')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function validateEmail(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return EMAIL_RE.test(String(value).trim()) ? null : 'Enter a valid email address'
}

const PHONE_RE = /^[+\d(][\d\s\-()/,]{6,40}$/
export function validatePhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return PHONE_RE.test(String(value).trim()) ? null : 'Enter a valid contact number (digits, spaces, + - ( ) only)'
}
