// Production entry point (Passenger startup file via passenger.cjs, or `pnpm start`).
//
// One Node process serves everything:
//   /admin, /api, /_next  → Payload admin panel + REST API (Next.js)
//   everything else       → the HR app (Astro)
// Both halves share a single Payload instance and SQLite connection.
import dotenv from 'dotenv'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { clientIp, normalizePath } from './server-security.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(root, '.env'), quiet: true })

process.env.NODE_ENV ||= 'production'
process.env.ASTRO_NODE_AUTOSTART = 'disabled'

const port = Number(process.env.PORT || 3000)
const NEXT_PREFIXES = ['/admin', '/api', '/_next']

// ---------------------------------------------------------------------------------------------
// Basic brute-force protection for authentication endpoints (per client IP, in memory).
const AUTH_PATHS = new Set([
  '/login',
  '/login/verify',
  '/forgot-password',
  '/set-password',
  '/profile',
  '/users',
  '/api/users',
  '/api/users/forgot-password',
])
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 20
const MAX_TRACKED = 10_000
const attempts = new Map()

function rateLimited(req, pathname) {
  if (req.method !== 'POST' || !AUTH_PATHS.has(pathname)) return false
  const now = Date.now()
  const key = `${clientIp(req)}|${pathname}`
  const entry = attempts.get(key)
  if (!entry || now - entry.start > WINDOW_MS) {
    // Bounded memory: drop the oldest entries when too many addresses are tracked.
    if (attempts.size >= MAX_TRACKED) attempts.delete(attempts.keys().next().value)
    attempts.set(key, { start: now, count: 1 })
    return false
  }
  entry.count++
  return entry.count > MAX_ATTEMPTS
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of attempts) if (now - entry.start > WINDOW_MS) attempts.delete(key)
}, WINDOW_MS).unref()

// ---------------------------------------------------------------------------------------------

// Sign-in must go through the app's email-code (2FA) flow, and sessions must end 12 hours after
// sign-in. These Payload endpoints would bypass that, so they are closed.
const BLOCKED_API = [
  '/api/users/login',
  '/api/users/refresh-token',
  '/api/users/first-register',
  '/api/users/reset-password',
  '/api/users/forgot-password',
  '/api/users/unlock',
  '/api/users/verify',
]

const HTTPS = (process.env.SERVER_URL ?? '').startsWith('https://')
// App pages: only our own scripts/styles/images; no plugins, no foreign forms, no <base> hijacking.
// (Inline scripts/styles are needed by the theme loader and charts; output is escaped by Astro.)
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')
const ADMIN_REDIRECTS = {
  '/admin/login': '/login?next=/admin',
  '/admin/create-first-user': '/register',
  '/admin/forgot': '/forgot-password',
}

function isNextPath(pathname) {
  return NEXT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

async function main() {
  const { default: next } = await import('next')
  const nextApp = next({ dev: false, dir: path.join(root, 'apps/cms'), quiet: true })
  await nextApp.prepare()
  const nextHandler = nextApp.getRequestHandler()

  const astroEntry = pathToFileURL(path.join(root, 'apps/web/dist/server/entry.mjs')).href
  const { handler: astroHandler } = await import(astroEntry)

  const server = http.createServer((req, res) => {
    const rawPath = (req.url || '/').split('?')[0]
    const pathname = normalizePath(rawPath)
    if (pathname === null) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Bad request.')
      return
    }

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    if (HTTPS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

    if (rateLimited(req, pathname)) {
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '900' })
      res.end('Too many attempts. Please wait 15 minutes and try again.')
      return
    }

    if (BLOCKED_API.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ errors: [{ message: 'Sign in at /login (email verification required).' }] }))
      return
    }
    const redirect = ADMIN_REDIRECTS[pathname]
    if (redirect) {
      res.writeHead(302, { Location: redirect })
      res.end()
      return
    }
    if (pathname.startsWith('/admin/reset/')) {
      res.writeHead(302, { Location: '/forgot-password' })
      res.end()
      return
    }

    if (isNextPath(pathname)) {
      nextHandler(req, res).catch((err) => {
        console.error(err)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
      return
    }
    res.setHeader('Content-Security-Policy', APP_CSP)
    astroHandler(req, res)
  })

  server.listen(port, () => {
    console.log(`HR system listening on http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start the HR system:', err)
  process.exit(1)
})
