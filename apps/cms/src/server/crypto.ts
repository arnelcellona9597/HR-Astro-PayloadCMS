// Authenticated encryption (AES-256-GCM) for secrets stored in the database: 2FA session tokens and
// the SMTP password. Keys are derived from PAYLOAD_SECRET per purpose, so changing PAYLOAD_SECRET
// makes old ciphertexts unreadable (the SMTP password must then be entered again).
import crypto from 'node:crypto'

import { PAYLOAD_SECRET } from '../env'

const keys = new Map<string, Buffer>()
function key(purpose: string): Buffer {
  let k = keys.get(purpose)
  if (!k) {
    k = crypto.createHash('sha256').update(`${PAYLOAD_SECRET}:hr:${purpose}`).digest()
    keys.set(purpose, k)
  }
  return k
}

export function encrypt(purpose: string, text: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(purpose), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

/** Returns null if the value was tampered with or encrypted with a different secret. */
export function decrypt(purpose: string, b64: string): string | null {
  try {
    const buf = Buffer.from(b64, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(purpose), buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex')
