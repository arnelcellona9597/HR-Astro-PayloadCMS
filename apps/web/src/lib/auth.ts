import type { AstroCookies } from 'astro'
import { createLocalReq, logoutOperation, type Payload } from 'payload'

import type { User } from '@hr/cms/types'

export const TOKEN_COOKIE = 'payload-token'
const secure = import.meta.env.PROD && !(process.env.SERVER_URL ?? '').startsWith('http://')

export function setAuthCookie(cookies: AstroCookies, token: string, exp?: number) {
  cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: exp ? new Date(exp * 1000) : undefined,
  })
}

export function clearAuthCookie(cookies: AstroCookies) {
  cookies.delete(TOKEN_COOKIE, { path: '/' })
}

/** Ends this browser's session on the server too, so a copied token stops working. */
export async function logout(payload: Payload, user: User | null, cookies: AstroCookies, allSessions = false) {
  if (user) {
    try {
      const req = await createLocalReq({ user: { ...user, collection: 'users' } as never }, payload)
      await logoutOperation({ allSessions, collection: payload.collections.users, req })
    } catch {
      // Session already gone — clearing the cookie is enough.
    }
  }
  clearAuthCookie(cookies)
}

export { safeNext } from '@hr/shared/redirect'
import { safeNext } from '@hr/shared/redirect'

/** Pending email-code check (2FA). Holds only a random id; the session token stays on the server. */
export const CHALLENGE_COOKIE = 'hr-2fa'

export function setChallengeCookie(cookies: AstroCookies, key: string, next?: string) {
  cookies.set(CHALLENGE_COOKIE, JSON.stringify({ key, next: next ?? '/' }), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 15 * 60 })
}

export function getChallengeCookie(cookies: AstroCookies): { key: string; next: string } | null {
  try {
    const v = JSON.parse(cookies.get(CHALLENGE_COOKIE)?.value ?? 'null')
    return v && typeof v.key === 'string' ? { key: v.key, next: safeNext(v.next) } : null
  } catch {
    return null
  }
}

export function clearChallengeCookie(cookies: AstroCookies) {
  cookies.delete(CHALLENGE_COOKIE, { path: '/' })
}

/** Client address as appended by our own proxy (the last X-Forwarded-For entry). */
export function clientIp(request: Request): string | undefined {
  return (
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1) || undefined
  )
}

/** Closes the server-side session behind a token we never handed to a browser. */
export async function revokeToken(payload: Payload, token: string) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { id?: number; sid?: string }
    if (!claims.id || !claims.sid) return
    const req = await createLocalReq({ user: { id: claims.id, collection: 'users', _sid: claims.sid } as never }, payload)
    await logoutOperation({ collection: payload.collections.users, req })
  } catch {
    /* already gone */
  }
}
