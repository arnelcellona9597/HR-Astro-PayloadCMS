// Email-code two-factor authentication for sign-in.
//
// Payload's own login runs first (password check, lockout, approval rules, session). The resulting
// token is NOT given to the browser: it is encrypted into a challenge and only released when the
// 6-digit code emailed to the user is entered. Wrong codes (5 max, counted atomically) or expiry
// (10 minutes) delete the challenge and revoke that session.
import { sql } from '@payloadcms/db-sqlite'
import type { SQL } from 'drizzle-orm'
import crypto from 'node:crypto'
import { createLocalReq, logoutOperation, type Payload } from 'payload'

import { IS_PROD, PAYLOAD_SECRET } from '../env'
import { decrypt, encrypt } from './crypto'
import { withWriteLock } from './dbLock'
import { emailConfigured, recordSmtp, sendNow } from './mailer'

export const CODE_TTL_MS = 10 * 60_000
export const MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 60_000
export const MAX_SENDS = 5

const TOKEN_PURPOSE = '2fa-token'
const hashCode = (key: string, code: string) => crypto.createHmac('sha256', PAYLOAD_SECRET).update(`${key}:${code}`).digest('hex')
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`
}

/** Payload JWT payload (no verification needed: we only read our own token's ids/expiry). */
export function decodeToken(token: string): { id?: number; sid?: string; exp?: number } {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

/** Ends the server-side session behind a token (it stops working immediately). */
export async function revokeSession(payload: Payload, token: string | null | undefined) {
  if (!token) return
  const { id, sid } = decodeToken(token)
  if (!id || !sid) return
  try {
    const req = await createLocalReq({ user: { id, collection: 'users', _sid: sid } as never }, payload)
    await logoutOperation({ collection: payload.collections.users, req })
  } catch {
    /* user or session already gone */
  }
}

async function sendCode(payload: Payload, email: string, code: string): Promise<{ delivered: boolean }> {
  const subject = `Your sign-in code: ${code}`
  const body = `Your sign-in verification code is:\n\n${code}\n\nIt expires in 10 minutes. If you did not try to sign in, change your password and tell your System Admin.`
  const logFallback = (why: string) => {
    // Private server log (cPanel owner only) so access is never lost when email is down.
    console.error(`[2FA] ${why} — login code for ${email}: ${code} (valid 10 minutes)`)
  }
  if (!(await emailConfigured(payload))) {
    logFallback('Email is not configured')
    if (IS_PROD) await recordSmtp(payload, 'The email server is not configured — sign-in codes are being written to the server log.')
    return { delivered: false }
  }
  try {
    await sendNow(payload, email, subject, body)
    return { delivered: true }
  } catch (err) {
    logFallback(`Email failed (${(err as Error).message})`)
    return { delivered: false }
  }
}

/** Removes expired sign-in challenges and revokes the sessions they were holding. */
export async function cleanupChallenges(payload: Payload) {
  const expired = await payload.find({
    collection: 'login-challenges',
    where: { expiresAt: { less_than: new Date().toISOString() } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const c of expired.docs) {
    if (c.purpose === 'login' && c.tokenEnc) await revokeSession(payload, decrypt(TOKEN_PURPOSE, c.tokenEnc))
    await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
  }
}

/** Step 1 of sign-in. Throws Payload's errors for wrong password, locked or unapproved accounts. */
export async function startLogin(payload: Payload, email: string, password: string, ip?: string) {
  await cleanupChallenges(payload)
  const res = await payload.login({ collection: 'users', data: { email, password }, context: { trustedAuth: true } } as never)
  const { token, exp, user } = res as { token?: string; exp?: number; user?: { id: number; email: string } }
  if (!token || !user) throw new Error('Could not sign in.')

  // One open challenge per user: starting again replaces the old one.
  const old = await payload.find({ collection: 'login-challenges', where: { and: [{ user: { equals: user.id } }, { purpose: { equals: 'login' } }] }, pagination: false, depth: 0, overrideAccess: true })
  for (const c of old.docs) {
    if (c.tokenEnc) await revokeSession(payload, decrypt(TOKEN_PURPOSE, c.tokenEnc))
    await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
  }
  const key = crypto.randomBytes(24).toString('hex')
  const code = newCode()
  await payload.create({
    collection: 'login-challenges',
    data: {
      key,
      purpose: 'login',
      user: user.id,
      codeHash: hashCode(key, code),
      tokenEnc: encrypt(TOKEN_PURPOSE, token),
      tokenExp: exp,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      sendCount: 1,
      lastSentAt: new Date().toISOString(),
      ip,
    },
    overrideAccess: true,
  })
  const delivery = await sendCode(payload, user.email, code)
  return { challenge: key, maskedEmail: maskEmail(user.email), ...delivery }
}

export type ChallengeInfo = { maskedEmail: string; expiresAt: string; resendAvailableAt: string; sendsLeft: number }

async function findChallenge(payload: Payload, key: string) {
  if (!/^[a-f0-9]{48}$/.test(key)) return null
  const res = await payload.find({
    collection: 'login-challenges',
    where: { and: [{ key: { equals: key } }, { purpose: { equals: 'login' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0] ?? null
}

export async function challengeInfo(payload: Payload, key: string): Promise<ChallengeInfo | null> {
  const c = await findChallenge(payload, key)
  if (!c || Date.parse(c.expiresAt) < Date.now()) return null
  const user = await payload.findByID({ collection: 'users', id: typeof c.user === 'object' ? c.user.id : c.user, overrideAccess: true, disableErrors: true })
  if (!user) return null
  return {
    maskedEmail: maskEmail(user.email),
    expiresAt: c.expiresAt,
    resendAvailableAt: new Date(Date.parse(c.lastSentAt ?? c.createdAt) + RESEND_COOLDOWN_MS).toISOString(),
    sendsLeft: MAX_SENDS - (c.sendCount ?? 1),
  }
}

export type VerifyResult = { ok: true; token: string; exp?: number } | { ok: false; error: string; restart: boolean }

async function all<T>(payload: Payload, q: SQL): Promise<T[]> {
  return (payload.db.drizzle as unknown as { all: (q: SQL) => Promise<T[]> }).all(q)
}

export async function verifyChallenge(payload: Payload, key: string, code: string): Promise<VerifyResult> {
  const c = await findChallenge(payload, key)
  if (!c) return { ok: false, error: 'This code has expired. Please sign in again.', restart: true }
  const token = c.tokenEnc ? decrypt(TOKEN_PURPOSE, c.tokenEnc) : null
  const end = async () => {
    await payload.delete({ collection: 'login-challenges', where: { id: { equals: c.id } }, overrideAccess: true })
    await revokeSession(payload, token)
  }
  if (Date.parse(c.expiresAt) < Date.now()) {
    await end()
    return { ok: false, error: 'This code has expired. Please sign in again.', restart: true }
  }
  // Count the attempt atomically BEFORE checking, so parallel guesses can't exceed the limit.
  const counted = await withWriteLock(() =>
    all<{ attempts: number }>(
      payload,
      sql`UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ${c.id} AND attempts < ${MAX_ATTEMPTS} RETURNING attempts`,
    ),
  )
  if (!counted.length) {
    await end()
    return { ok: false, error: 'Too many wrong codes. Please sign in again.', restart: true }
  }
  const given = Buffer.from(hashCode(key, code.replace(/\D/g, '')), 'hex')
  const expected = Buffer.from(c.codeHash, 'hex')
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    const left = MAX_ATTEMPTS - Number(counted[0]!.attempts)
    if (left <= 0) {
      await end()
      return { ok: false, error: 'Too many wrong codes. Please sign in again.', restart: true }
    }
    return { ok: false, error: `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`, restart: false }
  }
  // Single use: only the request that actually deletes the challenge gets the session.
  const deleted = await withWriteLock(() => all<{ id: number }>(payload, sql`DELETE FROM login_challenges WHERE id = ${c.id} RETURNING id`))
  if (!deleted.length || !token) return { ok: false, error: 'Please sign in again.', restart: true }
  const userId = typeof c.user === 'object' ? c.user.id : c.user
  await payload.update({ collection: 'users', id: userId, data: { emailVerified: true }, overrideAccess: true, context: { skipAudit: true } })
  return { ok: true, token, exp: c.tokenExp ?? undefined }
}

export async function resendChallenge(payload: Payload, key: string): Promise<{ ok: boolean; error?: string; delivered?: boolean }> {
  const c = await findChallenge(payload, key)
  if (!c || Date.parse(c.expiresAt) < Date.now()) return { ok: false, error: 'This code has expired. Please sign in again.' }
  if ((c.sendCount ?? 1) >= MAX_SENDS) return { ok: false, error: 'Too many codes sent. Please sign in again later.' }
  const wait = Date.parse(c.lastSentAt ?? c.createdAt) + RESEND_COOLDOWN_MS - Date.now()
  if (wait > 0) return { ok: false, error: `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.` }
  const user = await payload.findByID({ collection: 'users', id: typeof c.user === 'object' ? c.user.id : c.user, overrideAccess: true })
  const code = newCode()
  await payload.update({
    collection: 'login-challenges',
    id: c.id,
    data: {
      codeHash: hashCode(key, code),
      sendCount: (c.sendCount ?? 1) + 1,
      lastSentAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })
  const d = await sendCode(payload, user.email, code)
  return { ok: true, delivered: d.delivered }
}

/** Ends a pending sign-in (the "use another account" link). */
export async function cancelChallenge(payload: Payload, key: string) {
  const c = await findChallenge(payload, key)
  if (!c) return
  if (c.tokenEnc) await revokeSession(payload, decrypt(TOKEN_PURPOSE, c.tokenEnc))
  await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
}
