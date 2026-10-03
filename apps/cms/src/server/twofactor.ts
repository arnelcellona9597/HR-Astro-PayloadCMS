// Email-code two-factor authentication for sign-in and registration.
//
// Sign-in: Payload's own login runs first (password check, lockout, approval rules, session). The
// resulting token is NOT given to the browser: it is encrypted into a challenge and only released
// when the 6-digit code emailed to the user is entered. Wrong codes (5 max) or expiry (10 minutes)
// delete the challenge and revoke that session.
import crypto from 'node:crypto'
import { createLocalReq, logoutOperation, type Payload } from 'payload'

import { IS_PROD, PAYLOAD_SECRET } from '../env'
import { emailConfigured, notifyUsers, queueMessage, recordSmtp, sendNow } from './mailer'

export const CODE_TTL_MS = 10 * 60_000
export const MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 60_000
export const MAX_SENDS = 5
const UNVERIFIED_TTL_MS = 24 * 60 * 60_000

const encKey = crypto.createHash('sha256').update(`${PAYLOAD_SECRET}:hr-2fa-token`).digest()

function encrypt(text: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

function decrypt(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

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

async function revokeSession(payload: Payload, token: string | null | undefined) {
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

type Delivery = { delivered: boolean }

async function sendCode(payload: Payload, email: string, code: string, purpose: 'login' | 'register'): Promise<Delivery> {
  const subject = purpose === 'login' ? `Your sign-in code: ${code}` : `Confirm your email: ${code}`
  const body =
    purpose === 'login'
      ? `Your sign-in verification code is:\n\n${code}\n\nIt expires in 10 minutes. If you did not try to sign in, change your password and tell your System Admin.`
      : `Your email verification code is:\n\n${code}\n\nIt expires in 10 minutes. Enter it to finish your HR account request.`
  const logFallback = (why: string) => {
    // Private server log (cPanel owner only) so access is never lost when email is down.
    console.error(`[2FA] ${why} — ${purpose} code for ${email}: ${code} (valid 10 minutes)`)
  }
  if (!emailConfigured()) {
    logFallback('Email is not configured')
    if (IS_PROD) await recordSmtp(payload, 'Email (SMTP) is not configured — 2FA codes are being written to the server log.')
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

/** Removes expired challenges (revoking their sessions) and abandoned unverified sign-ups. */
export async function cleanupAuth(payload: Payload) {
  const now = new Date().toISOString()
  const expired = await payload.find({ collection: 'login-challenges', where: { expiresAt: { less_than: now } }, pagination: false, depth: 0, overrideAccess: true })
  for (const c of expired.docs) {
    if (c.purpose === 'login' && c.tokenEnc) await revokeSession(payload, safeDecrypt(c.tokenEnc))
    await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
  }
  const stale = new Date(Date.now() - UNVERIFIED_TTL_MS).toISOString()
  await payload.delete({
    collection: 'users',
    where: { and: [{ status: { equals: 'pending' } }, { emailVerified: { not_equals: true } }, { createdAt: { less_than: stale } }] },
    overrideAccess: true,
    context: { skipAudit: true },
  })
}

function safeDecrypt(s: string): string | null {
  try {
    return decrypt(s)
  } catch {
    return null
  }
}

async function createChallenge(
  payload: Payload,
  opts: { purpose: 'login' | 'register'; userId: number; email: string; token?: string; tokenExp?: number; ip?: string },
) {
  // One open challenge per user: starting again replaces the old one.
  const old = await payload.find({ collection: 'login-challenges', where: { user: { equals: opts.userId } }, pagination: false, depth: 0, overrideAccess: true })
  for (const c of old.docs) {
    if (c.purpose === 'login' && c.tokenEnc) await revokeSession(payload, safeDecrypt(c.tokenEnc))
    await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
  }
  const key = crypto.randomBytes(24).toString('hex')
  const code = newCode()
  await payload.create({
    collection: 'login-challenges',
    data: {
      key,
      purpose: opts.purpose,
      user: opts.userId,
      codeHash: hashCode(key, code),
      tokenEnc: opts.token ? encrypt(opts.token) : undefined,
      tokenExp: opts.tokenExp,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      sendCount: 1,
      lastSentAt: new Date().toISOString(),
      ip: opts.ip,
    },
    overrideAccess: true,
  })
  const delivery = await sendCode(payload, opts.email, code, opts.purpose)
  return { challenge: key, maskedEmail: maskEmail(opts.email), ...delivery }
}

/** Step 1 of sign-in. Throws Payload's errors for wrong password, locked or unapproved accounts. */
export async function startLogin(payload: Payload, email: string, password: string, ip?: string) {
  await cleanupAuth(payload)
  const res = await payload.login({ collection: 'users', data: { email, password } })
  if (!res.token || !res.user) throw new Error('Could not sign in.')
  return createChallenge(payload, { purpose: 'login', userId: res.user.id, email: res.user.email, token: res.token, tokenExp: res.exp, ip })
}

/** Step 1 of registration: creates the (pending, unverified) account and emails a code. */
export async function startRegistration(payload: Payload, data: { name: string; email: string; password: string }, ip?: string) {
  await cleanupAuth(payload)
  const email = data.email.trim().toLowerCase()
  // Someone who never finished verifying may simply try again.
  await payload.delete({
    collection: 'users',
    where: { and: [{ email: { equals: email } }, { status: { equals: 'pending' } }, { emailVerified: { not_equals: true } }] },
    overrideAccess: true,
    context: { skipAudit: true },
  })
  const user = await payload.create({
    collection: 'users',
    data: { name: data.name, email, password: data.password } as never,
    overrideAccess: false,
    context: { registration: true },
  })
  return createChallenge(payload, { purpose: 'register', userId: user.id, email, ip })
}

export type ChallengeInfo = { purpose: 'login' | 'register'; maskedEmail: string; expiresAt: string; resendAvailableAt: string; sendsLeft: number }

export async function challengeInfo(payload: Payload, key: string): Promise<ChallengeInfo | null> {
  const c = await findChallenge(payload, key)
  if (!c || Date.parse(c.expiresAt) < Date.now()) return null
  const user = await payload.findByID({ collection: 'users', id: typeof c.user === 'object' ? c.user.id : c.user, overrideAccess: true, disableErrors: true })
  if (!user) return null
  return {
    purpose: c.purpose,
    maskedEmail: maskEmail(user.email),
    expiresAt: c.expiresAt,
    resendAvailableAt: new Date(Date.parse(c.lastSentAt ?? c.createdAt) + RESEND_COOLDOWN_MS).toISOString(),
    sendsLeft: MAX_SENDS - (c.sendCount ?? 1),
  }
}

async function findChallenge(payload: Payload, key: string) {
  if (!/^[a-f0-9]{48}$/.test(key)) return null
  const res = await payload.find({ collection: 'login-challenges', where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
  return res.docs[0] ?? null
}

export type VerifyResult =
  | { ok: true; purpose: 'login'; token: string; exp?: number }
  | { ok: true; purpose: 'register'; firstUser: boolean }
  | { ok: false; error: string; restart: boolean }

export async function verifyChallenge(payload: Payload, key: string, code: string): Promise<VerifyResult> {
  const c = await findChallenge(payload, key)
  if (!c) return { ok: false, error: 'This code has expired. Please start again.', restart: true }
  const userId = typeof c.user === 'object' ? c.user.id : c.user
  const token = c.tokenEnc ? safeDecrypt(c.tokenEnc) : null
  const end = async () => {
    await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
    if (c.purpose === 'login') await revokeSession(payload, token)
  }
  if (Date.parse(c.expiresAt) < Date.now()) {
    await end()
    return { ok: false, error: 'This code has expired. Please start again.', restart: true }
  }
  const given = Buffer.from(hashCode(key, code.replace(/\D/g, '')), 'hex')
  const expected = Buffer.from(c.codeHash, 'hex')
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    const attempts = (c.attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await end()
      return { ok: false, error: 'Too many wrong codes. Please start again.', restart: true }
    }
    await payload.update({ collection: 'login-challenges', id: c.id, data: { attempts }, overrideAccess: true })
    const left = MAX_ATTEMPTS - attempts
    return { ok: false, error: `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`, restart: false }
  }

  await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
  const user = await payload.update({ collection: 'users', id: userId, data: { emailVerified: true }, overrideAccess: true, context: { skipAudit: true } })

  if (c.purpose === 'login') {
    if (!token) return { ok: false, error: 'Please sign in again.', restart: true }
    return { ok: true, purpose: 'login', token, exp: c.tokenExp ?? undefined }
  }

  // Registration verified: tell System Admins (unless this is the very first, self-approved account).
  const firstUser = user.status === 'approved' && user.role === 'system-admin'
  if (!firstUser) {
    const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
    await notifyUsers(payload, 'system-admins', {
      title: `New HR account request: ${user.name}`,
      body: `${user.name} (${user.email}) verified their email and is waiting for approval.`,
      link: '/users',
    })
    if (settings.registrationToAdmins !== false) {
      const admins = await payload.find({
        collection: 'users',
        where: { and: [{ role: { equals: 'system-admin' } }, { status: { equals: 'approved' } }] },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      if (admins.docs.length) {
        await queueMessage(payload, {
          subject: 'New HR account request: {{newUser}}',
          body: '{{newUser}} ({{newUserEmail}}) requested an HR account and verified their email.\n\nReview it on the HR Accounts page of {{companyName}}.',
          category: 'System',
          automatic: true,
          recipients: admins.docs.map((a) => ({ userId: a.id, context: { newUser: user.name, newUserEmail: user.email } })),
          audienceLabel: 'System Admins',
        }).catch((err) => payload.logger.warn({ err, msg: 'Could not queue registration notice' }))
      }
    }
  }
  return { ok: true, purpose: 'register', firstUser }
}

export async function resendChallenge(payload: Payload, key: string): Promise<{ ok: boolean; error?: string; delivered?: boolean }> {
  const c = await findChallenge(payload, key)
  if (!c || Date.parse(c.expiresAt) < Date.now()) return { ok: false, error: 'This code has expired. Please start again.' }
  if ((c.sendCount ?? 1) >= MAX_SENDS) return { ok: false, error: 'Too many codes sent. Please start again later.' }
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
      // A new code gets the full 10 minutes.
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })
  const d = await sendCode(payload, user.email, code, c.purpose)
  return { ok: true, delivered: d.delivered }
}

/** Ends a pending sign-in (the "use another account" link). */
export async function cancelChallenge(payload: Payload, key: string) {
  const c = await findChallenge(payload, key)
  if (!c) return
  if (c.purpose === 'login' && c.tokenEnc) await revokeSession(payload, safeDecrypt(c.tokenEnc))
  await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
}

