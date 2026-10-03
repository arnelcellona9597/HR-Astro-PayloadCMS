// Sends email with the SMTP settings saved in the database (Settings → Email server).
// Nothing about the mail server is read from files or environment variables.
import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailAdapter, Payload } from 'payload'

import { decrypt } from '../server/crypto'

const SMTP_PURPOSE = 'smtp-password'

type SmtpConfig = { host: string; port: number; security: string; username: string; password: string; fromAddress: string; fromName: string }

let cached: { at: number; config: SmtpConfig | null; transport: Transporter | null } | null = null
const TTL_MS = 60_000

export function invalidateSmtpCache() {
  cached?.transport?.close()
  cached = null
}

/** The saved SMTP settings, or null when they are incomplete. */
export async function loadSmtpConfig(payload: Payload): Promise<SmtpConfig | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config
  // Read the raw row: afterRead strips the encrypted password from normal reads.
  const doc = (await payload.db.findGlobal({ slug: 'smtp-settings', req: undefined as never })) as Record<string, unknown> | null
  const password = typeof doc?.passwordEnc === 'string' ? decrypt(SMTP_PURPOSE, doc.passwordEnc) : null
  const config =
    doc?.host && doc.fromAddress
      ? {
          host: String(doc.host),
          port: Number(doc.port ?? 465),
          security: String(doc.security ?? 'ssl'),
          username: String(doc.username ?? ''),
          password: password ?? '',
          fromAddress: String(doc.fromAddress),
          fromName: String(doc.fromName ?? 'HR System'),
        }
      : null
  cached?.transport?.close()
  cached = { at: Date.now(), config, transport: null }
  return config
}

function transportFor(config: SmtpConfig): Transporter {
  if (cached?.transport) return cached.transport
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'ssl',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  if (cached) cached.transport = transport
  return transport
}

export function dbEmailAdapter(): EmailAdapter {
  return ({ payload }) => ({
    name: 'database-smtp',
    // Required by Payload; the real From comes from the saved settings on every send.
    defaultFromAddress: 'no-reply@localhost',
    defaultFromName: 'HR System',
    sendEmail: async (message) => {
      const config = await loadSmtpConfig(payload)
      if (!config) throw new Error('The email server is not configured (Settings → Email server).')
      const transport = transportFor(config)
      return transport.sendMail({ ...message, from: { name: config.fromName, address: config.fromAddress } })
    },
  })
}

/** Connects and logs in to the saved SMTP server without sending anything. */
export async function verifySmtp(payload: Payload): Promise<{ ok: boolean; error?: string }> {
  invalidateSmtpCache()
  const config = await loadSmtpConfig(payload)
  if (!config) return { ok: false, error: 'Enter the host and the From address first.' }
  try {
    await transportFor(config).verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
