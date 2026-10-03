// Outgoing email: queue → throttled sending (hourly limit) → retries → per-message status.
// Every email (manual or automatic) goes through here except 2FA codes, which are sent immediately.
import { allowanceForYear } from '../globals/LeaveSettings'
import { CONTEXT_MERGE_FIELDS, MERGE_FIELDS, renderTemplate, unknownPlaceholders, validateEmail } from '@hr/shared'
import { sql } from '@payloadcms/db-sqlite'
import type { SQL } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import type { Payload, PayloadRequest, Where } from 'payload'

import { loadBrand, renderEmail, type Brand } from '../email/layout'
import { DATA_DIR } from '../env'
import { leaveUsageByEmployee } from './stats'

type Row = Record<string, unknown>
type User = { id: number; name?: string | null; email?: string | null } | null | undefined

export type Audience = {
  employeeIds?: number[]
  /** Employees matching ALL given filters (statuses default to Active when `allActive`). */
  employeeFilter?: { allActive?: boolean; status?: string[]; classification?: string[]; branch?: number[] }
  userIds?: number[]
  allUsers?: boolean
  emails?: string[]
}

export type RecipientSpec = {
  employeeId?: number
  userId?: number
  email?: string
  name?: string
  /** Extra merge values just for this recipient (e.g. leaveDates, netPay). */
  context?: Record<string, string | number | null | undefined>
  payslipId?: number
}

export type QueueInput = {
  subject: string
  body: string
  category: string
  audience?: Audience
  recipients?: RecipientSpec[]
  audienceLabel?: string
  attachments?: number[]
  sentBy?: User
  automatic?: boolean
  related?: { collection: string; id: string | number }
  /** Merge values shared by every recipient. */
  context?: Record<string, string | number | null | undefined>
  req?: PayloadRequest
}

export const MAX_RECIPIENTS = 2000
const MAX_ATTEMPTS = 3

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST) || process.env.HR_EMAIL_CAPTURE === '1'
}

async function all<T extends Row>(payload: Payload, q: SQL): Promise<T[]> {
  return (payload.db.drizzle as unknown as { all: (q: SQL) => Promise<T[]> }).all(q)
}

const firstWord = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/)[0] ?? ''

type Prepared = { spec: RecipientSpec; name: string; email: string | null; subject: string; body: string; skip?: string }

/** Validates placeholders, resolves the audience and renders each recipient's text (nothing is saved). */
export async function prepareMessage(payload: Payload, input: QueueInput): Promise<Prepared[]> {
  const { req } = input
  const contextKeys = [
    ...Object.keys(input.context ?? {}),
    ...new Set((input.recipients ?? []).flatMap((r) => Object.keys(r.context ?? {}))),
  ]
  const allowed = [...MERGE_FIELDS.map((f) => f.name), ...contextKeys]
  const bad = unknownPlaceholders(`${input.subject}\n${input.body}`, allowed)
  if (bad.length) {
    const ctx = CONTEXT_MERGE_FIELDS.filter((f) => bad.includes(f.name)).map((f) => `{{${f.name}}}`)
    throw new Error(
      `Unknown placeholder(s): ${bad.map((b) => `{{${b}}}`).join(', ')}${ctx.length ? ` (${ctx.join(', ')} only work in automatic emails)` : ''}`,
    )
  }

  // 1. Expand the audience into recipient specs
  const specs: RecipientSpec[] = [...(input.recipients ?? [])]
  const a = input.audience ?? {}
  const empWhere: Where[] = []
  if (a.employeeIds?.length) empWhere.push({ id: { in: a.employeeIds } })
  if (a.employeeFilter) {
    const f = a.employeeFilter
    const and: Where[] = []
    if (f.allActive) and.push({ employmentStatus: { equals: 'Active' } })
    if (f.status?.length) and.push({ employmentStatus: { in: f.status } })
    if (f.classification?.length) and.push({ classification: { in: f.classification } })
    if (f.branch?.length) and.push({ station: { in: f.branch } })
    if (and.length) empWhere.push({ and })
  }
  if (empWhere.length) {
    const res = await payload.find({ collection: 'employees', where: { or: empWhere }, pagination: false, depth: 0, overrideAccess: true, select: { employeeId: true }, req })
    for (const e of res.docs) specs.push({ employeeId: e.id })
  }
  if (a.userIds?.length || a.allUsers) {
    const res = await payload.find({
      collection: 'users',
      where: { and: [{ status: { equals: 'approved' } }, ...(a.allUsers ? [] : [{ id: { in: a.userIds } }])] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const u of res.docs) specs.push({ userId: u.id })
  }
  for (const email of a.emails ?? []) specs.push({ email: email.trim() })
  if (!specs.length) throw new Error('Choose at least one recipient.')

  // 2. Load the people behind the specs
  const empIds = [...new Set(specs.map((s) => s.employeeId).filter((x): x is number => Boolean(x)))]
  const userIds = [...new Set(specs.map((s) => s.userId).filter((x): x is number => Boolean(x)))]
  const [employees, users, brand] = await Promise.all([
    empIds.length
      ? payload.find({ collection: 'employees', where: { id: { in: empIds } }, pagination: false, depth: 1, overrideAccess: true, req, populate: { branches: { name: true } } })
      : null,
    userIds.length ? payload.find({ collection: 'users', where: { id: { in: userIds } }, pagination: false, depth: 0, overrideAccess: true, req }) : null,
    loadBrand(payload),
  ])
  const empById = new Map((employees?.docs ?? []).map((e) => [e.id, e]))
  const userById = new Map((users?.docs ?? []).map((u) => [u.id, u]))

  let leaveLeft: ((id: number) => number) | null = null
  if (`${input.subject}${input.body}`.includes('leaveRemaining')) {
    const year = Number(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }))
    const [usage, settings] = await Promise.all([leaveUsageByEmployee(payload, year), payload.findGlobal({ slug: 'leave-settings', overrideAccess: true, req })])
    const allowance = allowanceForYear(settings, year)
    leaveLeft = (id) => allowance - (usage.get(id) ?? 0)
  }

  // 3. Render per recipient, de-duplicated by email address
  const seen = new Set<string>()
  const prepared: Prepared[] = []
  for (const spec of specs) {
    const emp = spec.employeeId ? empById.get(spec.employeeId) : undefined
    const user = spec.userId ? userById.get(spec.userId) : undefined
    const email = (spec.email ?? emp?.email ?? user?.email ?? '').trim().toLowerCase() || null
    const name = spec.name ?? (emp ? `${emp.firstName} ${emp.lastName}` : (user?.name ?? email ?? ''))
    const values = {
      companyName: brand.companyName,
      firstName: emp?.firstName ?? firstWord(user?.name ?? spec.name),
      lastName: emp?.lastName ?? '',
      fullName: emp ? `${emp.firstName} ${emp.middleName ? `${emp.middleName.charAt(0)}. ` : ''}${emp.lastName}${emp.extension ? ` ${emp.extension}` : ''}` : name,
      employeeId: emp?.employeeId ?? '',
      position: emp?.position ?? '',
      station: emp && typeof emp.station === 'object' && emp.station ? emp.station.name : '',
      leaveRemaining: emp && leaveLeft ? leaveLeft(emp.id) : '',
      ...input.context,
      ...spec.context,
    }
    const p: Prepared = { spec, name, email, subject: renderTemplate(input.subject, values), body: renderTemplate(input.body, values) }
    if (!email) p.skip = 'No email address on file'
    else if (validateEmail(email)) p.skip = 'Invalid email address'
    else if (seen.has(email) && !spec.payslipId) continue
    if (email) seen.add(email)
    prepared.push(p)
  }
  if (prepared.length > MAX_RECIPIENTS) throw new Error(`Too many recipients (${prepared.length}). The limit is ${MAX_RECIPIENTS} per message.`)
  return prepared
}

/** What a message would look like: counts, the first recipient's rendered text, and who'd be skipped. */
export async function previewMessage(payload: Payload, input: QueueInput) {
  const prepared = await prepareMessage(payload, input)
  const first = prepared.find((p) => !p.skip) ?? prepared[0]!
  const brand = await loadBrand(payload)
  return {
    total: prepared.length,
    deliverable: prepared.filter((p) => !p.skip).length,
    skipped: prepared.filter((p) => p.skip).map((p) => ({ name: p.name, reason: p.skip! })),
    sample: { to: first.email, name: first.name, subject: first.subject, body: first.body, html: renderEmail(brand, first.subject, first.body, { sender: input.sentBy?.name ?? undefined }).html },
  }
}

/** Validates placeholders, resolves the audience and stores the message + one row per recipient. */
export async function queueMessage(payload: Payload, input: QueueInput): Promise<{ messageId: number; total: number; queued: number; skipped: number }> {
  const { req } = input
  const prepared = await prepareMessage(payload, input)
  const skipped = prepared.filter((p) => p.skip).length
  const message = await payload.create({
    collection: 'messages',
    data: {
      subject: input.subject,
      body: input.body,
      category: input.category as never,
      audience: input.audienceLabel ?? `${prepared.length} recipient(s)`,
      attachments: input.attachments ?? [],
      automatic: Boolean(input.automatic),
      relatedCollection: input.related?.collection,
      relatedId: input.related ? String(input.related.id) : undefined,
      sentBy: input.sentBy?.id,
      sentByName: input.sentBy ? (input.sentBy.name ?? input.sentBy.email ?? null) : 'System',
      status: prepared.length === skipped ? 'failed' : 'queued',
      total: prepared.length,
      skipped,
    },
    overrideAccess: true,
    req,
  })
  for (const p of prepared) {
    await payload.create({
      collection: 'message-recipients',
      data: {
        message: message.id,
        name: p.name,
        email: p.email,
        employee: p.spec.employeeId,
        user: p.spec.userId,
        subject: p.subject,
        body: p.body,
        payslip: p.spec.payslipId,
        status: p.skip ? 'skipped' : 'queued',
        error: p.skip,
      },
      overrideAccess: true,
      req,
    })
  }
  // Inside a transaction the rows aren't visible yet; the worker picks them up on its next tick.
  if (!req?.transactionID) setTimeout(() => void drainQueue(payload).catch(() => {}), 500).unref?.()
  return { messageId: message.id, total: prepared.length, queued: prepared.length - skipped, skipped }
}

/** Records whether the mail server is working, for the warning banner. */
export async function recordSmtp(payload: Payload, error: string | null) {
  try {
    const s = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
    const now = new Date().toISOString()
    if (error) {
      await payload.updateGlobal({
        slug: 'notification-settings',
        data: { smtpLastError: error.slice(0, 500), smtpLastErrorAt: now },
        overrideAccess: true,
        context: { skipAudit: true },
      })
    } else if (s.smtpLastError || !s.smtpLastOkAt || Date.now() - Date.parse(s.smtpLastOkAt) > 10 * 60_000) {
      await payload.updateGlobal({
        slug: 'notification-settings',
        data: { smtpLastError: null, smtpLastOkAt: now },
        overrideAccess: true,
        context: { skipAudit: true },
      })
    }
  } catch {
    /* never let bookkeeping break sending */
  }
}

async function attachmentsFor(payload: Payload, messageAttachments: unknown[], payslipId: number | null) {
  const out: { filename: string; content: Buffer; contentType?: string }[] = []
  const staticDir = payload.collections.media.config.upload.staticDir as string
  for (const a of messageAttachments) {
    const m = typeof a === 'object' && a ? (a as Row) : await payload.findByID({ collection: 'media', id: a as number, overrideAccess: true })
    if (!m?.filename) continue
    const file = path.join(staticDir, path.basename(String(m.filename)))
    if (fs.existsSync(file)) out.push({ filename: String(m.filename), content: fs.readFileSync(file), contentType: String(m.mimeType ?? '') || undefined })
  }
  if (payslipId) {
    const { payslipPdf } = await import('./payroll')
    const { filename, pdf } = await payslipPdf(payload, payslipId)
    out.push({ filename, content: Buffer.from(pdf), contentType: 'application/pdf' })
  }
  return out
}

let running = false

/**
 * Sends the next batch of queued emails, within the hourly limit. Safe to call from several places
 * at once: rows are claimed atomically so each email goes out once.
 */
export async function processQueue(payload: Payload, max = 25): Promise<{ sent: number; failed: number; remaining: number }> {
  if (running) return { sent: 0, failed: 0, remaining: -1 }
  running = true
  let sent = 0
  let failed = 0
  try {
    const now = new Date().toISOString()
    // Release rows stuck in "sending" (e.g. the process stopped mid-send) after 10 minutes.
    await all(
      payload,
      sql`UPDATE message_recipients SET status = 'queued' WHERE status = 'sending' AND updated_at < ${new Date(Date.now() - 10 * 60_000).toISOString()} RETURNING id`,
    )
    const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const [{ n }] = await all<{ n: number }>(payload, sql`SELECT COUNT(*) AS n FROM message_recipients WHERE status = 'sent' AND sent_at > ${hourAgo}`)
    const budget = Math.min(max, (settings.hourlyLimit ?? 100) - Number(n))
    if (budget > 0) {
      const claimed = await all<{ id: number }>(
        payload,
        sql`UPDATE message_recipients SET status = 'sending', updated_at = ${now}
            WHERE id IN (SELECT id FROM message_recipients WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}) ORDER BY id LIMIT ${budget})
            RETURNING id`,
      )
      let brand: Brand | null = null
      const touched = new Set<number>()
      for (const { id } of claimed) {
        const r = await payload.findByID({ collection: 'message-recipients', id, depth: 0, overrideAccess: true })
        const msgId = typeof r.message === 'object' ? r.message.id : r.message
        touched.add(msgId)
        const msg = await payload.findByID({ collection: 'messages', id: msgId, depth: 0, overrideAccess: true })
        brand ??= await loadBrand(payload)
        try {
          const { html, text } = renderEmail(brand, r.subject ?? msg.subject, r.body ?? msg.body, { sender: msg.automatic ? undefined : (msg.sentByName ?? undefined) })
          const attachments = await attachmentsFor(payload, (msg.attachments ?? []) as unknown[], typeof r.payslip === 'object' && r.payslip ? r.payslip.id : (r.payslip ?? null))
          await payload.sendEmail({ to: r.email!, subject: r.subject ?? msg.subject, html, text, replyTo: brand.replyTo, attachments })
          await payload.update({ collection: 'message-recipients', id, data: { status: 'sent', sentAt: new Date().toISOString(), error: null }, overrideAccess: true })
          sent++
        } catch (err) {
          const attempts = (r.attempts ?? 0) + 1
          const giveUp = attempts >= MAX_ATTEMPTS
          await payload.update({
            collection: 'message-recipients',
            id,
            data: {
              status: giveUp ? 'failed' : 'queued',
              attempts,
              error: (err as Error).message?.slice(0, 300) ?? 'Send failed',
              nextAttemptAt: giveUp ? null : new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
            },
            overrideAccess: true,
          })
          await recordSmtp(payload, (err as Error).message ?? 'Send failed')
          if (giveUp) failed++
        }
      }
      if (sent) await recordSmtp(payload, null)
      for (const id of touched) await rollUp(payload, id)
    }
    const [{ q }] = await all<{ q: number }>(payload, sql`SELECT COUNT(*) AS q FROM message_recipients WHERE status IN ('queued', 'sending')`)
    return { sent, failed, remaining: Number(q) }
  } finally {
    running = false
  }
}

/**
 * Keeps sending batches until the queue is empty, the hourly limit is reached or `maxBatches` ran
 * (so one run can't hold the process for too long).
 */
export async function drainQueue(payload: Payload, maxBatches = 8) {
  let sent = 0
  let failed = 0
  let remaining = 0
  for (let i = 0; i < maxBatches; i++) {
    const r = await processQueue(payload)
    if (r.remaining < 0) break // another run is busy
    sent += r.sent
    failed += r.failed
    remaining = r.remaining
    if (r.remaining === 0 || r.sent + r.failed === 0) break
  }
  return { sent, failed, remaining }
}

/** Recomputes a message's counters and overall status from its recipients. */
export async function rollUp(payload: Payload, messageId: number) {
  const rows = await all<{ status: string; n: number }>(payload, sql`SELECT status, COUNT(*) AS n FROM message_recipients WHERE message_id = ${messageId} GROUP BY status`)
  const c = (s: string) => Number(rows.find((r) => r.status === s)?.n ?? 0)
  const pending = c('queued') + c('sending')
  const status = pending ? (c('sent') ? 'sending' : 'queued') : c('failed') === 0 && c('sent') > 0 ? 'sent' : c('sent') === 0 ? 'failed' : 'partial'
  await payload.update({
    collection: 'messages',
    id: messageId,
    data: { status: status as never, sent: c('sent'), failed: c('failed'), skipped: c('skipped') },
    overrideAccess: true,
  })
}

/** Puts failed recipients of a message back in the queue. */
export async function retryFailed(payload: Payload, messageId: number): Promise<number> {
  const rows = await all<{ id: number }>(
    payload,
    sql`UPDATE message_recipients SET status = 'queued', attempts = 0, next_attempt_at = NULL WHERE message_id = ${messageId} AND status = 'failed' RETURNING id`,
  )
  await rollUp(payload, messageId)
  setTimeout(() => void drainQueue(payload).catch(() => {}), 200).unref?.()
  return rows.length
}

/** Sends one email right away (used for 2FA codes and test emails). Throws if sending fails. */
export async function sendNow(payload: Payload, to: string, subject: string, body: string) {
  const brand = await loadBrand(payload)
  const { html, text } = renderEmail(brand, subject, body)
  try {
    await payload.sendEmail({ to, subject, html, text, replyTo: brand.replyTo })
    await recordSmtp(payload, null)
  } catch (err) {
    await recordSmtp(payload, (err as Error).message ?? 'Send failed')
    throw err
  }
}

/** In-app notifications for HR users (bell). `to: 'system-admins'` targets every approved System Admin. */
export async function notifyUsers(
  payload: Payload,
  to: number[] | 'system-admins' | 'all',
  n: { title: string; body?: string; link?: string },
  req?: PayloadRequest,
) {
  let ids = Array.isArray(to) ? to : []
  if (!Array.isArray(to)) {
    const res = await payload.find({
      collection: 'users',
      where: { and: [{ status: { equals: 'approved' } }, ...(to === 'system-admins' ? [{ role: { equals: 'system-admin' } }] : [])] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    ids = res.docs.map((u) => u.id)
  }
  for (const user of ids) {
    await payload.create({ collection: 'notifications', data: { user, title: n.title, body: n.body, link: n.link }, overrideAccess: true, req })
  }
}

/** Uses a saved template by key (falls back to the given text if the template was removed). */
export async function templateByKey(payload: Payload, key: string, fallback: { subject: string; body: string }, req?: PayloadRequest) {
  const res = await payload.find({ collection: 'email-templates', where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true, req })
  const t = res.docs[0]
  return t ? { subject: t.subject, body: t.body } : fallback
}

let workerStarted = false
/** Background sender while the process is alive; cron hits /internal/queue when it's idle. */
export function startQueueWorker(payload: Payload) {
  if (workerStarted || process.env.HR_QUEUE_WORKER === 'false') return
  workerStarted = true
  const timer = setInterval(() => void drainQueue(payload).catch((err) => payload.logger.error({ err, msg: 'Email queue failed' })), 30_000)
  timer.unref()
}

export const OUTBOX_FILE = path.join(DATA_DIR, 'outbox.jsonl')
