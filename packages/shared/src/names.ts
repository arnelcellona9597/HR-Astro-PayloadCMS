export type NameParts = {
  lastName?: string | null
  firstName?: string | null
  middleName?: string | null
  extension?: string | null
}

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()

/** "DELA CRUZ, Juan P. Jr." — the usual HR listing format. */
export function formatNameLastFirst(n: NameParts): string {
  const last = clean(n.lastName)
  const first = clean(n.firstName)
  const mi = clean(n.middleName) ? `${clean(n.middleName).charAt(0).toUpperCase()}.` : ''
  const ext = clean(n.extension)
  const rest = [first, mi, ext].filter(Boolean).join(' ')
  return [last, rest].filter(Boolean).join(', ')
}

/** "Juan P. Dela Cruz Jr." */
export function formatNameFirstLast(n: NameParts): string {
  const mi = clean(n.middleName) ? `${clean(n.middleName).charAt(0).toUpperCase()}.` : ''
  return [clean(n.firstName), mi, clean(n.lastName), clean(n.extension)].filter(Boolean).join(' ')
}

export function initials(n: NameParts): string {
  return `${clean(n.firstName).charAt(0)}${clean(n.lastName).charAt(0)}`.toUpperCase()
}
