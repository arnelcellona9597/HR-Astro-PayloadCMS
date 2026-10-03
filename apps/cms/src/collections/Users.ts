import { options } from '@hr/shared/enums'
import { APIError, type CollectionConfig, type Where } from 'payload'

import { hasRole, isApproved, isSystemAdmin, systemAdminField } from '../access'
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
    hidden: ({ user }) => (user as { role?: string } | null)?.role !== 'system-admin',
  },
  auth: {
    // Sessions end 12 hours after sign-in. Token refresh is blocked in server.mjs, so this is absolute.
    tokenExpiration: 12 * 60 * 60,
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
    // New accounts come from the email-verified registration flow (context.registration) or a System Admin.
    // Plain REST sign-ups are refused so nobody can skip email verification.
    create: ({ req }) => hasRole(req.user, 'system-admin') || req.context?.registration === true,
    read: ({ req }) => {
      if (hasRole(req.user, 'system-admin')) return true
      if (!req.user) return false
      return { id: { equals: req.user.id } } as Where
    },
    update: ({ req }) => {
      if (hasRole(req.user, 'system-admin')) return true
      if (!req.user || (req.user as { status?: string }).status !== 'approved') return false
      return { id: { equals: req.user.id } } as Where
    },
    delete: isSystemAdmin,
    unlock: isSystemAdmin,
    // Both roles may use the Payload admin panel; the Users collection itself is hidden from HR Staff.
    admin: ({ req }) => isApproved(req.user),
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
      access: { create: systemAdminField, update: systemAdminField },
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
      access: { create: systemAdminField, update: systemAdminField },
      admin: { position: 'sidebar', description: 'Only approved accounts can sign in.' },
    },
    {
      name: 'emailVerified',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'Set when the user enters an emailed code.' },
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
          // Until a System Admin has verified their email, a new sign-up becomes the System Admin so the
          // system can be bootstrapped (an abandoned, never-verified first sign-up doesn't block this).
          const { totalDocs } = await req.payload.count({
            collection: 'users',
            where: { and: [{ role: { equals: 'system-admin' } }, { emailVerified: { equals: true } }] },
            overrideAccess: true,
            req,
          })
          if (totalDocs === 0 && req.context?.registration === true) {
            data.role = 'system-admin'
            data.status = 'approved'
          }
        }
        if (data.status === 'approved' && originalDoc?.status !== 'approved') {
          data.approvedAt = new Date().toISOString()
        }
        // Never leave the system without an active System Admin.
        const losingSuperAdmin =
          operation === 'update' &&
          originalDoc?.role === 'system-admin' &&
          originalDoc?.status === 'approved' &&
          ((data.role && data.role !== 'system-admin') || (data.status && data.status !== 'approved'))
        if (losingSuperAdmin) {
          const { totalDocs } = await req.payload.count({
            collection: 'users',
            where: { role: { equals: 'system-admin' }, status: { equals: 'approved' }, id: { not_equals: originalDoc.id } },
            overrideAccess: true,
            req,
          })
          if (totalDocs === 0) {
            throw new APIError('At least one approved System Admin must remain.', 400, undefined, true)
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
          throw new APIError('Your account is waiting for approval by a System Admin.', 403, undefined, true)
        }
        if (user.status !== 'approved') {
          throw new APIError('Your account has been disabled. Contact a System Admin.', 403, undefined, true)
        }
        return user
      },
    ],
    afterChange: audit.afterChange,
    afterDelete: audit.afterDelete,
  },
  timestamps: true,
}
