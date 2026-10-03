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
export async function logout(payload: Payload, user: User | null, cookies: AstroCookies) {
  if (user) {
    try {
      const req = await createLocalReq({ user: { ...user, collection: 'users' } as never }, payload)
      await logoutOperation({ collection: payload.collections.users, req })
    } catch {
      // Session already gone — clearing the cookie is enough.
    }
  }
  clearAuthCookie(cookies)
}

/** Only allow redirects back into this site after login. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return '/'
  return next
}
