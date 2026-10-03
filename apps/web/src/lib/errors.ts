// Turns errors into messages people can act on, keyed by field where possible. Only messages that are
// meant for users are shown; anything unexpected is logged and replaced by a generic message, so
// internal details (SQL, file paths, mail-server responses) never reach the browser.

export type FormErrors = { form?: string; fields: Record<string, string> }

import { isUserError } from '@hr/cms/server/errors'

export { UserError } from '@hr/cms/server/errors'

type PayloadErrorShape = {
  message?: string
  status?: number
  isPublic?: boolean
  data?: { errors?: { path?: string; field?: string; message?: string }[] }
}

export function toFormErrors(err: unknown): FormErrors {
  const e = err as PayloadErrorShape
  const fields: Record<string, string> = {}
  for (const item of e?.data?.errors ?? []) {
    const path = item.path ?? item.field
    if (path) fields[path.replace(/\.\d+\./g, '.')] = item.message ?? 'Invalid value'
  }
  if (Object.keys(fields).length) return { form: 'Please fix the highlighted fields.', fields }
  const message = e?.message ?? String(err)
  if (/UNIQUE constraint failed/i.test(message)) return { form: 'This value is already used by another record.', fields }
  // Our UserError, or a Payload 4xx error (validation, forbidden, not found): safe to show.
  if (isUserError(err) || (typeof e?.status === 'number' && e.status < 500)) return { form: message, fields }
  console.error(err)
  return { form: 'Something went wrong. Nothing was changed. Please try again.', fields }
}

/** The user-facing message for any error (see toFormErrors). */
export function errorMessage(err: unknown): string {
  const fe = toFormErrors(err)
  return Object.values(fe.fields)[0] ?? fe.form ?? 'Something went wrong.'
}
