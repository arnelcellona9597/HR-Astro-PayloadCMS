// HR accounts: created only by System Admins (or the create-admin command). New users get an invite
// link to choose their own password; "forgot password" uses the same single-use links.
//
// Link tokens are random 256-bit values; only their SHA-256 is stored. Invite/reset emails are sent
// directly (not through the outbox), so the links never appear in the Messages history.
import type { Payload } from 'payload'
import { createLocalReq, logoutOperation } from 'payload'

import { SERVER_URL } from '../env'
import { randomToken, sha256 } from './crypto'
import { UserError } from './errors'
import { emailConfigured, sendNow } from './mailer'

export { UserError }
import { maskEmail } from './twofactor'

const INVITE_TTL_MS = 24 * 60 * 60_000
const RESET_TTL_MS = 60 * 60_000

type Kind = 'invite' | 'reset'
type Admin = { id: number; collection?: string } & Record<string, unknown>


/** Creates (or replaces) a set-password link for a user and emails it. */
export async function issuePasswordLink(payload: Payload, userId: number, kind: Kind): Promise<{ delivered: boolean; link: string }> {
  const user = await payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
  await payload.delete({
    collection: 'login-challenges',
    where: { and: [{ user: { equals: userId } }, { purpose: { equals: 'invite' } }] },
    overrideAccess: true,
  })
  const token = randomToken(32)
  await payload.create({
    collection: 'login-challenges',
    data: {
      key: sha256(token),
      purpose: 'invite',
      user: userId,
      codeHash: kind,
      expiresAt: new Date(Date.now() + (kind === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS)).toISOString(),
      attempts: 0,
      sendCount: 1,
      lastSentAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  const link = `${SERVER_URL}/set-password?token=${token}`
  const subject = kind === 'invite' ? 'Your HR System account — set your password' : 'Reset your HR System password'
  const body =
    kind === 'invite'
      ? `Hi ${user.name},\n\nAn HR System account was created for you. Choose your password here (link valid for 24 hours, single use):\n\n${link}\n\nAfter that, sign in with your email and password. Each sign-in also asks for a code we email to you.`
      : `Hi ${user.name},\n\nSomeone asked to reset the password of your HR System account. Choose a new password here (link valid for 1 hour, single use):\n\n${link}\n\nIf this wasn't you, ignore this email — your password stays the same.`
  let delivered = false
  if (await emailConfigured(payload)) {
    try {
      await sendNow(payload, user.email, subject, body)
      delivered = true
    } catch {
      delivered = false
    }
  }
  if (!delivered) console.error(`[accounts] Email not sent — ${kind} link for ${user.email}: ${link}`)
  return { delivered, link }
}

/** System Admin adds an HR account: approved, no usable password until the invite link is used. */
export async function inviteUser(payload: Payload, admin: Admin, data: { name: string; email: string; role: string }) {
  const user = await payload.create({
    collection: 'users',
    data: {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      role: data.role as never,
      status: 'approved',
      // Random, never shown: the user chooses their own password through the invite link.
      password: `${randomToken(24)}Aa1`,
    } as never,
    user: { ...admin, collection: 'users' } as never,
    overrideAccess: false,
  })
  const sent = await issuePasswordLink(payload, user.id, 'invite')
  return { user, ...sent }
}

/** "Forgot password": always succeeds from the outside (no hint whether the address exists). */
export async function requestPasswordReset(payload: Payload, email: string) {
  const res = await payload.find({
    collection: 'users',
    where: { and: [{ email: { equals: email.trim().toLowerCase() } }, { status: { equals: 'approved' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const user = res.docs[0]
  if (user) await issuePasswordLink(payload, user.id, 'reset')
}

async function findLink(payload: Payload, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const res = await payload.find({
    collection: 'login-challenges',
    where: { and: [{ key: { equals: sha256(token) } }, { purpose: { equals: 'invite' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const c = res.docs[0]
  if (!c) return null
  if (Date.parse(c.expiresAt) < Date.now()) {
    await payload.delete({ collection: 'login-challenges', id: c.id, overrideAccess: true })
    return null
  }
  return c
}

export async function passwordLinkInfo(payload: Payload, token: string) {
  const c = await findLink(payload, token)
  if (!c) return null
  const user = await payload.findByID({ collection: 'users', id: typeof c.user === 'object' ? c.user.id : c.user, overrideAccess: true, disableErrors: true })
  if (!user || user.status !== 'approved') return null
  return { kind: c.codeHash as Kind, name: user.name, maskedEmail: maskEmail(user.email) }
}

/** Sets the password from an invite/reset link (single use) and signs the user out everywhere. */
export async function setPasswordWithLink(payload: Payload, token: string, password: string) {
  const c = await findLink(payload, token)
  if (!c) throw new UserError('This link is invalid or has expired. Ask your System Admin for a new one.')
  const userId = typeof c.user === 'object' ? c.user.id : c.user
  // Claim the link first so it can only be used once, even with parallel requests.
  const claimed = await payload.delete({ collection: 'login-challenges', where: { id: { equals: c.id } }, overrideAccess: true })
  if (!claimed.docs.length) throw new UserError('This link was already used.')
  const user = await payload.update({
    collection: 'users',
    id: userId,
    data: { password, emailVerified: true } as never,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  // A fresh password also clears a lockout from earlier failed attempts.
  await payload.unlock({ collection: 'users', data: { email: user.email } as never, overrideAccess: true, context: { trustedAuth: true } } as never)
  try {
    const req = await createLocalReq({ user: { id: userId, collection: 'users' } as never }, payload)
    await logoutOperation({ allSessions: true, collection: payload.collections.users, req })
  } catch {
    /* no sessions */
  }
}
