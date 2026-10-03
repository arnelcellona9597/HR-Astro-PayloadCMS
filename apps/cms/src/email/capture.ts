import fs from 'node:fs'
import path from 'node:path'
import type { EmailAdapter } from 'payload'

/**
 * Dev/test email transport: appends every email as one JSON line to DATA_DIR/outbox.jsonl instead of
 * sending it. Enabled with HR_EMAIL_CAPTURE=1 (refused in production unless HR_E2E=1).
 */
export function captureAdapter(dataDir: string): EmailAdapter {
  const file = path.join(dataDir, 'outbox.jsonl')
  return () => ({
    name: 'capture',
    defaultFromAddress: 'hr@localhost',
    defaultFromName: 'HR System',
    sendEmail: async (message) => {
      const attachments = ((message.attachments ?? []) as unknown[]).map((a) => {
        const content = (a as { content?: unknown }).content
        return {
          filename: (a as { filename?: string }).filename,
          contentType: (a as { contentType?: string }).contentType,
          contentBase64: Buffer.isBuffer(content) ? content.toString('base64') : undefined,
        }
      })
      fs.appendFileSync(
        file,
        `${JSON.stringify({ at: new Date().toISOString(), to: message.to, subject: message.subject, text: message.text, html: message.html, replyTo: message.replyTo, attachments })}\n`,
      )
      return { captured: true }
    },
  })
}

/** Reads captured emails (tests and e2e). */
export function readCaptured(dataDir: string): { to: unknown; subject: string; text?: string; html?: string; attachments: { filename?: string; contentBase64?: string }[] }[] {
  const file = path.join(dataDir, 'outbox.jsonl')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}
