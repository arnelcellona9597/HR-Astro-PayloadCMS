import type { Role } from '@hr/shared/enums'
import type { Access, FieldAccess, PayloadRequest } from 'payload'

type MaybeUser = PayloadRequest['user'] | null | undefined

/** Only approved accounts count as signed in — pending and disabled users have no access at all. */
export function isApproved(user: MaybeUser): boolean {
  return Boolean(user && user.collection === 'users' && (user as { status?: string }).status === 'approved')
}

export function hasRole(user: MaybeUser, ...roles: Role[]): boolean {
  return isApproved(user) && roles.includes((user as { role?: Role }).role as Role)
}

export const isStaff: Access = ({ req }) => isApproved(req.user)
export const isHrAdmin: Access = ({ req }) => hasRole(req.user, 'super-admin', 'hr-admin')
export const isSuperAdmin: Access = ({ req }) => hasRole(req.user, 'super-admin')
export const nobody: Access = () => false
export const anyone: Access = () => true

export const superAdminField: FieldAccess = ({ req }) => hasRole(req.user, 'super-admin')

/** Standard access for HR records: staff can view/add/edit, only HR admins can delete. */
export const hrRecordAccess = {
  read: isStaff,
  create: isStaff,
  update: isStaff,
  delete: isHrAdmin,
}
