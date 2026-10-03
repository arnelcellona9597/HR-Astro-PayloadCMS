import { options } from '@hr/shared/enums'
import { APIError, type CollectionConfig, type Where } from 'payload'

import { hasRole, isApproved, isSystemAdmin, systemAdminField } from '../access'
import { IS_PROD, SERVER_URL } from '../env'
import { auditHooks } from '../hooks/audit'

export const PASSWORD_MIN_LENGTH = 10
const TRUSTED_ONLY = ['login', 'refresh', 'resetPassword', 'unlock', 'forgotPassword']

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
    // Only System Admins create accounts (invite flow or the create-admin command, which uses overrideAccess).
    create: isSystemAdmin,
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
    {
      // Overrides Payload's built-in auth email field: only System Admins may change an address
      // (otherwise a stolen session could redirect future 2FA codes to an attacker's mailbox).
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
      access: { update: systemAdminField },
    },
    { name: 'name', label: 'Full Name', type: 'text', required: true, maxLength: 120 },
    {
      // Shown in the app's header and account menu. Like every upload it is private to signed-in staff.
      name: 'avatar',
      label: 'Profile picture',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'PNG, JPG, WEBP or GIF image, up to 2 MB. Change it from “My account”.' },
    },
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
    {
      name: 'approvedAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        // Sign-in, token refresh, password reset and unlock must come from this app's own flows
        // (email 2FA, 12-hour sessions). Anything else — e.g. Payload's REST endpoints, however the
        // URL is encoded — is refused here, inside Payload, not just by the URL filter in server.mjs.
        if (TRUSTED_ONLY.includes(operation) && req.context?.trustedAuth !== true) {
          throw new APIError('Please sign in on the sign-in page.', 403, undefined, true)
        }
        if (operation === 'create' || operation === 'update' || operation === 'resetPassword') {
          const password = (args.data as { password?: unknown } | undefined)?.password
          if (password !== undefined) {
            checkPassword(password)
            // Changing a password needs proof: the current password (My account), an invite or a reset link.
            if (operation === 'update' && req.context?.passwordChange !== true) {
              throw new APIError('Change passwords from “My account” (or use a password reset link).', 403, undefined, true)
            }
          }
        }
        return args
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        // A profile picture must be an image, never e.g. a scanned document picked by id.
        const avatarId = typeof data.avatar === 'object' && data.avatar ? data.avatar.id : data.avatar
        const previousId = typeof originalDoc?.avatar === 'object' && originalDoc?.avatar ? originalDoc.avatar.id : originalDoc?.avatar
        if (avatarId && avatarId !== previousId) {
          const media = await req.payload.findByID({ collection: 'media', id: avatarId, depth: 0, overrideAccess: true, req, disableErrors: true })
          if (!media || !/^image\/(png|jpeg|webp|gif)$/.test(media.mimeType ?? '')) {
            throw new APIError('The profile picture must be a PNG, JPG, WEBP or GIF image.', 400, undefined, true)
          }
        }
        // A new address must be confirmed again with an emailed code.
        if (operation === 'update' && data.email && originalDoc?.email && data.email.toLowerCase() !== originalDoc.email.toLowerCase()) {
          data.emailVerified = false
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
