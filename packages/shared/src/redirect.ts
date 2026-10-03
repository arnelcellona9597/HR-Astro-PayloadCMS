/**
 * Only allow redirects to a path on this site: rejects absolute URLs, protocol-relative `//x`,
 * browser-normalised `/\x`, control characters and the sign-in pages themselves.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.length > 512) return '/'
  let decoded: string
  try {
    decoded = decodeURIComponent(next)
  } catch {
    return '/'
  }
  // Check both the raw and the decoded form (no `//`, `/\`, `\` or control characters anywhere).
  for (const v of [next, decoded]) {
    if (!/^\/(?![/\\])/.test(v) || /[\u0000-\u001f\u007f\\]/.test(v)) return '/'
  }
  try {
    const u = new URL(next, 'http://hr.invalid')
    if (u.origin !== 'http://hr.invalid') return '/'
    const path = `${u.pathname}${u.search}${u.hash}`
    if (path.startsWith('//') || path.startsWith('/login') || path.startsWith('/set-password')) return '/'
    return path
  } catch {
    return '/'
  }
}
