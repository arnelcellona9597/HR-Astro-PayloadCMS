import { options } from '@hr/shared/enums'
import { APIError, type CollectionConfig, type Where } from 'payload'

import { hasRole, isSuperAdmin, superAdminField } from '../access'
import { IS_PROD, SERVER_URL } from '../env'
import { auditHooks } from '../hooks/audit'

export const PASSWORD_MIN_LENGTH = 10

function checkPassword(password: unknown) {
  if (typeof password !== 'string') return
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new APIError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, 400, undefined, true)
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new APIError('Password must contain both letters and numbers.', 400, undefined, true)
  }
}

const audit = auditHooks('email')

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'HR User', plural: 'HR Users' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'status', 'updatedAt'],
    group: 'Administration',
  },
  auth: {
    tokenExpiration: 8 * 60 * 60, // 8 hours
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000, // 15 minutes
    useSessions: true,
    cookies: {
      sameSite: 'Lax',
      secure: IS_PROD,
    },
    forgotPassword: {
      expiration: 60 * 60 * 1000, // 1 hour
      generateEmailSubject: () => 'Reset your HR System password',
      generateEmailHTML: (args) => {
        const url = `${SERVER_URL}/reset-password?token=${encodeURIComponent(args?.token ?? '')}`
        return `<p>Someone requested a password reset for your HR System account.</p>
<p><a href="${url}">Set a new password</a> (link valid for 1 hour).</p>
<p>If this wasn't you, you can ignore this email.</p>`
      },
    },
  },
  access: {
    // Public sign-up is allowed; the account stays "pending" until a Super Admin approves it.
    create: () => true,
    read: ({ req }) => {
      if (hasRole(req.user, 'super-admin')) return true
      if (!req.user) return false
      return { id: { equals: req.user.id } } as Where
    },
    update: ({ req }) => {
      if (hasRole(req.user, 'super-admin')) return true
      if (!req.user || (req.user as { status?: string }).status !== 'approved') return false
      return { id: { equals: req.user.id } } as Where
    },
    delete: isSuperAdmin,
    unlock: isSuperAdmin,
    admin: ({ req }) => hasRole(req.user, 'super-admin', 'hr-admin'),
  },
  fields: [
    { name: 'name', label: 'Full Name', type: 'text', required: true, maxLength: 120 },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'hr-staff',
      options: options.roles,
      saveToJWT: true,
      access: { create: superAdminField, update: superAdminField },
      admin: { position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: options.userStatuses,
      saveToJWT: true,
      index: true,
      access: { create: superAdminField, update: superAdminField },
      admin: { position: 'sidebar', description: 'Only approved accounts can sign in.' },
    },
    { name: 'approvedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation }) => {
        if (operation === 'create' || operation === 'update' || operation === 'resetPassword') {
          checkPassword(args.data?.password)
        }
        return args
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation === 'create') {
          // The very first account becomes the Super Admin so the system can be bootstrapped.
          const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
          if (totalDocs === 0) {
            data.role = 'super-admin'
            data.status = 'approved'
          }
        }
        if (data.status === 'approved' && originalDoc?.status !== 'approved') {
          data.approvedAt = new Date().toISOString()
        }
        // Never leave the system without an active Super Admin.
        const losingSuperAdmin =
          operation === 'update' &&
          originalDoc?.role === 'super-admin' &&
          originalDoc?.status === 'approved' &&
          ((data.role && data.role !== 'super-admin') || (data.status && data.status !== 'approved'))
        if (losingSuperAdmin) {
          const { totalDocs } = await req.payload.count({
            collection: 'users',
            where: { role: { equals: 'super-admin' }, status: { equals: 'approved' }, id: { not_equals: originalDoc.id } },
            overrideAccess: true,
            req,
          })
          if (totalDocs === 0) {
            throw new APIError('At least one approved Super Admin must remain.', 400, undefined, true)
          }
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (String(req.user?.id) === String(id)) {
          throw new APIError('You cannot delete your own account.', 400, undefined, true)
        }
      },
    ],
    beforeLogin: [
      ({ user }) => {
        if (user.status === 'pending') {
          throw new APIError('Your account is waiting for approval by a Super Admin.', 403, undefined, true)
        }
        if (user.status !== 'approved') {
          throw new APIError('Your account has been disabled. Contact a Super Admin.', 403, undefined, true)
        }
        return user
      },
    ],
    afterChange: [
      ...audit.afterChange,
      async ({ doc, operation, req }) => {
        if (operation !== 'create' || doc.status !== 'pending') return doc
        // Best-effort notice to Super Admins; a mail failure must not block registration.
        try {
          const admins = await req.payload.find({
            collection: 'users',
            where: { role: { equals: 'super-admin' }, status: { equals: 'approved' } },
            overrideAccess: true,
            limit: 20,
            depth: 0,
            req,
          })
          const to = admins.docs.map((a) => a.email).filter(Boolean)
          if (to.length && process.env.SMTP_HOST) {
            await req.payload.sendEmail({
              to,
              subject: `New HR System registration: ${doc.name}`,
              html: `<p>${doc.name} (${doc.email}) registered and is waiting for approval.</p><p><a href="${SERVER_URL}/users">Review pending accounts</a></p>`,
            })
          }
        } catch (err) {
          req.payload.logger.warn({ err, msg: 'Could not send registration notice' })
        }
        return doc
      },
    ],
    afterDelete: audit.afterDelete,
  },
  timestamps: true,
}
