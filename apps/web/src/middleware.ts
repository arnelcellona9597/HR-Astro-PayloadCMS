import { defineMiddleware } from 'astro:middleware'

import type { User } from '@hr/cms/types'

import { clearAuthCookie, TOKEN_COOKIE } from './lib/auth'
import { getHr } from './lib/payload'

const PUBLIC_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password'])
const PUBLIC_PREFIXES = ['/_astro/', '/files/', '/favicon']

// Pages only HR admins / super admins may open.
const ROLE_RULES: { prefix: string; roles: User['role'][] }[] = [
  { prefix: '/users', roles: ['super-admin'] },
  { prefix: '/settings', roles: ['super-admin'] },
  { prefix: '/audit', roles: ['super-admin', 'hr-admin'] },
  { prefix: '/data/import', roles: ['super-admin', 'hr-admin'] },
]

/** Cross-site request forgery guard: state-changing requests must come from this site. */
function sameOrigin(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return true
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const source = request.headers.get('origin') ?? request.headers.get('referer')
  if (!host || !source) return false
  try {
    return new URL(source).host === host
  } catch {
    return false
  }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url
  if (!sameOrigin(ctx.request)) return new Response('Cross-site request blocked.', { status: 403 })
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) && !pathname.startsWith('/files/')) return next()

  const payload = await getHr()
  ctx.locals.payload = payload

  let user: User | null = null
  const token = ctx.cookies.get(TOKEN_COOKIE)?.value
  if (token) {
    try {
      // The same-origin check above already guards state-changing requests, so hand Payload the token
      // directly instead of relying on browser-specific Sec-Fetch headers.
      const res = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
      const u = res.user as (User & { collection?: string }) | null
      if (u && u.collection === 'users' && u.status === 'approved') user = u
    } catch {
      user = null
    }
    if (!user) clearAuthCookie(ctx.cookies)
  }
  ctx.locals.user = user

  ctx.locals.settings = await payload.findGlobal({ slug: 'site-settings', depth: 1, overrideAccess: true })
  const themeCookie = ctx.cookies.get('hr-theme')?.value
  ctx.locals.theme =
    themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : (ctx.locals.settings.defaultTheme ?? 'system')

  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith('/files/')
  if (!user && !isPublic) {
    if (ctx.request.method !== 'GET') return new Response('Your session has ended. Please sign in again.', { status: 401 })
    const nextUrl = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + ctx.url.search)}`
    return ctx.redirect(`/login${nextUrl}`)
  }
  if (user && (pathname === '/login' || pathname === '/register')) return ctx.redirect('/')

  const rule = ROLE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))
  if (rule && user && !rule.roles.includes(user.role)) {
    return new Response(null, { status: 302, headers: { Location: '/?denied=1' } })
  }

  const response = await next()
  if (user) response.headers.set('Cache-Control', 'private, no-store')
  return response
})
