import type { AstroCookies } from 'astro'

// One-shot success/error message shown after a redirect (POST → redirect → GET).
const COOKIE = 'hr-flash'

export type Flash = { type: 'success' | 'error' | 'info'; message: string }

export function setFlash(cookies: AstroCookies, flash: Flash) {
  cookies.set(COOKIE, JSON.stringify(flash), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 })
}

export function takeFlash(cookies: AstroCookies): Flash | null {
  const raw = cookies.get(COOKIE)?.value
  if (!raw) return null
  cookies.delete(COOKIE, { path: '/' })
  try {
    return JSON.parse(raw) as Flash
  } catch {
    return null
  }
}
