import type { GlobalConfig } from 'payload'

import { isSystemAdmin } from '../access'
import { diffDocs, writeAudit } from '../hooks/audit'
import { encrypt } from '../server/crypto'

export const SMTP_PURPOSE = 'smtp-password'

/**
 * Outgoing mail server. Stored in the database (not in files); the password is encrypted with
 * AES-256-GCM and never returned by any API. System Admins only.
 */
export const SmtpSettings: GlobalConfig = {
  slug: 'smtp-settings',
  label: 'Email Server (SMTP)',
  admin: { group: 'Settings', hidden: ({ user }) => (user as { role?: string } | null)?.role !== 'system-admin' },
  access: { read: isSystemAdmin, update: isSystemAdmin },
  fields: [
    { name: 'host', type: 'text', maxLength: 255 },
    { name: 'port', type: 'number', min: 1, max: 65535, defaultValue: 465 },
    {
      name: 'security',
      type: 'select',
      defaultValue: 'ssl',
      options: [
        { label: 'SSL/TLS (SMTPS, usually port 465)', value: 'ssl' },
        { label: 'STARTTLS (usually port 587)', value: 'starttls' },
        { label: 'None (not recommended)', value: 'none' },
      ],
    },
    { name: 'username', type: 'text', maxLength: 255 },
    // Write-only: a new password typed in the form. Encrypted into passwordEnc, then discarded.
    { name: 'password', type: 'text', virtual: true, admin: { description: 'Leave blank to keep the saved password.' } },
    { name: 'clearPassword', type: 'checkbox', virtual: true, admin: { hidden: true } },
    { name: 'passwordEnc', type: 'text', hidden: true },
    { name: 'passwordSet', type: 'checkbox', defaultValue: false, admin: { readOnly: true } },
    { name: 'fromAddress', label: 'From address', type: 'email' },
    { name: 'fromName', label: 'From name', type: 'text', maxLength: 120, defaultValue: 'HR System' },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        const pw = typeof data.password === 'string' ? data.password : ''
        if (pw) {
          data.passwordEnc = encrypt(SMTP_PURPOSE, pw)
          data.passwordSet = true
        } else if (data.clearPassword === true) {
          data.passwordEnc = null
          data.passwordSet = false
        }
        delete data.password
        delete data.clearPassword
        return data
      },
    ],
    afterRead: [
      ({ doc }) => {
        // Never expose the password (even encrypted) in API responses.
        delete doc.passwordEnc
        delete doc.password
        return doc
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const { invalidateSmtpCache } = await import('../email/dbAdapter')
        invalidateSmtpCache()
        const changes = diffDocs(previousDoc, doc)
        for (const k of ['passwordEnc', 'password']) delete changes[k]
        if (Object.keys(changes).length) {
          await writeAudit(req, { action: 'update', collectionSlug: 'smtp-settings', docLabel: 'Email Server (SMTP)', changes })
        }
        return doc
      },
    ],
  },
}
