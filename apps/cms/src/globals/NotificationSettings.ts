import crypto from 'node:crypto'
import type { GlobalConfig } from 'payload'

import { isStaff, systemAdminField } from '../access'
import { diffDocs, writeAudit } from '../hooks/audit'

export const NotificationSettings: GlobalConfig = {
  slug: 'notification-settings',
  label: 'Email & Notifications',
  admin: { group: 'Settings' },
  access: { read: isStaff, update: isStaff },
  fields: [
    {
      type: 'collapsible',
      label: 'Automatic emails',
      fields: [
        { name: 'leaveFiledToEmployee', label: 'Email the employee when wellness leave is filed', type: 'checkbox', defaultValue: true },
        { name: 'leaveStatusToEmployee', label: 'Email the employee when a leave status changes', type: 'checkbox', defaultValue: true },
        { name: 'payrollReleasedToEmployee', label: 'Email each employee their payslip (PDF) when payroll is released', type: 'checkbox', defaultValue: true },
        { name: 'registrationToAdmins', label: 'Email System Admins when someone requests an HR account', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'hourlyLimit',
      label: 'Maximum emails per hour',
      type: 'number',
      required: true,
      min: 1,
      max: 5000,
      defaultValue: 100,
      admin: { description: 'Shared hosting mail servers usually allow 100–500 per hour. Extra emails wait in the queue.' },
    },
    { name: 'replyTo', label: 'Reply-to address', type: 'email', admin: { description: 'Where replies go (e.g. the HR office mailbox). Leave blank to use the sender address.' } },
    { name: 'footer', label: 'Email footer', type: 'textarea', defaultValue: 'This is an automated message from the HR office.' },
    // System-maintained fields: nobody can write them through the API (the server uses overrideAccess).
    {
      name: 'queueKey',
      type: 'text',
      access: { read: systemAdminField, create: () => false, update: () => false },
      admin: { readOnly: true, description: 'Secret for the cron job that sends queued emails (X-Queue-Key header).' },
    },
    { name: 'smtpLastError', type: 'textarea', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: 'smtpLastErrorAt', type: 'date', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: 'smtpLastOkAt', type: 'date', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (!data.queueKey && !originalDoc?.queueKey) data.queueKey = crypto.randomBytes(18).toString('hex')
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (req.context?.skipAudit) return doc
        const changes = diffDocs(previousDoc, doc)
        for (const k of ['smtpLastError', 'smtpLastErrorAt', 'smtpLastOkAt', 'queueKey']) delete changes[k]
        if (Object.keys(changes).length) {
          await writeAudit(req, { action: 'update', collectionSlug: 'notification-settings', docLabel: 'Email & Notifications', changes })
        }
        return doc
      },
    ],
  },
}
