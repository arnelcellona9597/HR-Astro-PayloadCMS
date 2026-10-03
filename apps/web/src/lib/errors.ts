// Turns Payload errors into messages people can act on, keyed by field where possible.

export type FormErrors = { form?: string; fields: Record<string, string> }

type PayloadErrorShape = {
  message?: string
  status?: number
  data?: { errors?: { path?: string; field?: string; message?: string }[] }
  isPublic?: boolean
}

const FIELD_HINTS: [RegExp, string][] = [
  [/UNIQUE constraint failed: \w+\.(\w+)/i, 'This value is already used by another record.'],
]

export function toFormErrors(err: unknown): FormErrors {
  const e = err as PayloadErrorShape
  const fields: Record<string, string> = {}
  for (const item of e?.data?.errors ?? []) {
    const path = item.path ?? item.field
    if (path) fields[path.replace(/\.\d+\./g, '.')] = item.message ?? 'Invalid value'
  }
  if (Object.keys(fields).length) {
    return { form: 'Please fix the highlighted fields.', fields }
  }
  const message = e?.message ?? String(err)
  for (const [re, hint] of FIELD_HINTS) {
    if (re.test(message)) return { form: hint, fields: {} }
  }
  if (e?.status && e.status < 500) return { form: message, fields }
  console.error(err)
  return { form: 'Something went wrong while saving. Nothing was changed. Please try again.', fields }
}
