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

/** Any approved HR user (System Admin or HR Staff). HR Staff can do everything except manage HR accounts. */
export const isStaff: Access = ({ req }) => isApproved(req.user)
/** Only System Admins: managing HR accounts. */
export const isSystemAdmin: Access = ({ req }) => hasRole(req.user, 'system-admin')
export const nobody: Access = () => false
export const anyone: Access = () => true

export const systemAdminField: FieldAccess = ({ req }) => hasRole(req.user, 'system-admin')

/** Standard access for HR records: every approved HR user can view, add, edit and delete. */
export const hrRecordAccess = {
  read: isStaff,
  create: isStaff,
  update: isStaff,
  delete: isStaff,
}
