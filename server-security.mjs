// Request helpers used by server.mjs for security decisions (kept separate so they can be tested).

/**
 * The client address as seen by our own proxy (Apache/Passenger appends it as the LAST
 * X-Forwarded-For entry). Earlier entries are supplied by the client and can't be trusted.
 */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  const last = typeof fwd === 'string' ? fwd.split(',').map((s) => s.trim()).filter(Boolean).at(-1) : undefined
  return last || req.socket.remoteAddress || 'unknown'
}

/**
 * Canonical form of a request path for security checks: percent-decoded, repeated slashes collapsed,
 * no trailing slash, lower-case. Returns null for malformed encodings.
 */
export function normalizePath(rawPath) {
  let p
  try {
    p = decodeURIComponent(rawPath)
  } catch {
    return null
  }
  if (/[\u0000-\u001f\\]/.test(p)) return null
  p = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  return p.toLowerCase()
}
