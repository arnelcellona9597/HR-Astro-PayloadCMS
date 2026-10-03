import { CONTEXT_MERGE_FIELDS, MERGE_FIELDS, unknownPlaceholders } from '@hr/shared/merge'
import { APIError, type CollectionConfig, type Where } from 'payload'

import { isApproved, isStaff, nobody } from '../access'
import { text } from '../fields'
import { auditHooks } from '../hooks/audit'

export const MESSAGE_CATEGORIES = ['Leave', 'Payroll', 'Announcement', 'Reminder', 'General', 'System'] as const
const categoryOptions = MESSAGE_CATEGORIES.map((v) => ({ label: v, value: v }))
const ALL_FIELDS = [...MERGE_FIELDS, ...CONTEXT_MERGE_FIELDS].map((f) => f.name)

/** Reusable subject/body texts with {{placeholders}} (leave, payroll, reminders, announcements). */
export const EmailTemplates: CollectionConfig = {
  slug: 'email-templates',
  labels: { singular: 'Email Template', plural: 'Email Templates' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'category', 'key', 'updatedAt'], group: 'Messaging' },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  defaultSort: 'name',
  fields: [
    text('name', 'Template name', { required: true, unique: true, maxLength: 120 }),
    {
      name: 'key',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Set for templates used by automatic emails (they cannot be deleted).' },
    },
    { name: 'category', type: 'select', required: true, defaultValue: 'General', options: categoryOptions },
    text('subject', 'Subject', { required: true, maxLength: 200 }),
    { name: 'body', type: 'textarea', required: true, admin: { rows: 10 } },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        const bad = unknownPlaceholders(`${data?.subject ?? ''}\n${data?.body ?? ''}`, ALL_FIELDS)
        if (bad.length) throw new APIError(`Unknown placeholder(s): ${bad.map((b) => `{{${b}}}`).join(', ')}`, 400, undefined, true)
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const doc = await req.payload.findByID({ collection: 'email-templates', id, overrideAccess: true, req })
        if (doc.key) throw new APIError('This template is used by automatic emails. Edit it instead of deleting it.', 400, undefined, true)
      },
    ],
    ...auditHooks('name'),
  },
}

/** Outbox: one row per message sent from the system (manual or automatic). */
export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Message', plural: 'Messages' },
  admin: { useAsTitle: 'subject', defaultColumns: ['createdAt', 'subject', 'category', 'status', 'total', 'sentByName'], group: 'Messaging' },
  // Created by the mailer service only; staff can read the outbox.
  access: { read: isStaff, create: nobody, update: nobody, delete: isStaff },
  defaultSort: '-createdAt',
  fields: [
    { name: 'subject', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'category', type: 'select', options: categoryOptions, defaultValue: 'General', index: true },
    { name: 'audience', type: 'text', admin: { description: 'Who it was sent to, in words.' } },
    { name: 'attachments', type: 'upload', relationTo: 'media', hasMany: true },
    { name: 'automatic', type: 'checkbox', defaultValue: false, index: true },
    { name: 'relatedCollection', type: 'text' },
    { name: 'relatedId', type: 'text' },
    { name: 'sentBy', type: 'relationship', relationTo: 'users' },
    { name: 'sentByName', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: ['queued', 'sending', 'sent', 'partial', 'failed'].map((v) => ({ label: v, value: v })),
    },
    { name: 'total', type: 'number', defaultValue: 0 },
    { name: 'sent', type: 'number', defaultValue: 0 },
    { name: 'failed', type: 'number', defaultValue: 0 },
    { name: 'skipped', type: 'number', defaultValue: 0 },
  ],
  timestamps: true,
}

/** One row per recipient of a message: the personalised text and its delivery status. */
export const MessageRecipients: CollectionConfig = {
  slug: 'message-recipients',
  labels: { singular: 'Message Recipient', plural: 'Message Recipients' },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'status', 'sentAt'], group: 'Messaging', hidden: true },
  access: { read: isStaff, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'message', type: 'relationship', relationTo: 'messages', required: true, index: true },
    { name: 'name', type: 'text' },
    { name: 'email', type: 'text', index: true },
    { name: 'employee', type: 'relationship', relationTo: 'employees', index: true },
    { name: 'user', type: 'relationship', relationTo: 'users' },
    { name: 'subject', type: 'text' },
    { name: 'body', type: 'textarea' },
    { name: 'payslip', type: 'relationship', relationTo: 'payslips', admin: { description: 'Attach this payslip as a PDF.' } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: ['queued', 'sending', 'sent', 'failed', 'skipped'].map((v) => ({ label: v, value: v })),
    },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'nextAttemptAt', type: 'date', index: true },
    { name: 'error', type: 'text' },
    { name: 'sentAt', type: 'date', index: true },
  ],
  timestamps: true,
}

/** In-app notifications for HR users (bell in the sidebar). */
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: 'Notification', plural: 'Notifications' },
  admin: { useAsTitle: 'title', group: 'Messaging', hidden: true },
  access: {
    read: ({ req }) => (isApproved(req.user) ? ({ user: { equals: req.user!.id } } as Where) : false),
    update: ({ req }) => (isApproved(req.user) ? ({ user: { equals: req.user!.id } } as Where) : false),
    delete: ({ req }) => (isApproved(req.user) ? ({ user: { equals: req.user!.id } } as Where) : false),
    create: nobody,
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    { name: 'link', type: 'text' },
    { name: 'readAt', type: 'date', index: true },
  ],
  timestamps: true,
}
