import type { ModuleField } from '@hr/shared/modules'
import { isValidYmd } from '@hr/shared/dates'

export type ParsedForm = { data: Record<string, unknown>; errors: Record<string, string> }

function str(fd: FormData, name: string): string {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Reads a submitted HTML form into Payload data using the module's field definitions.
 * Blank inputs become null (clearing the field); malformed numbers/dates are reported, never guessed.
 */
export function parseModuleForm(fd: FormData, fields: ModuleField[]): ParsedForm {
  const data: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  for (const f of fields) {
    if (f.computed || !fd.has(f.name)) continue
    const raw = str(fd, f.name)
    if (raw === '') {
      if (f.required && !f.fromEmployee) errors[f.name] = `${f.label} is required`
      data[f.name] = null
      continue
    }
    switch (f.kind) {
      case 'number':
      case 'year': {
        const n = Number(raw)
        if (!Number.isFinite(n)) errors[f.name] = `${f.label} must be a number`
        else if (f.kind === 'year' && (!Number.isInteger(n) || n < 2000 || n > 2100)) errors[f.name] = 'Enter a 4-digit year'
        else data[f.name] = n
        break
      }
      case 'date':
        if (!isValidYmd(raw)) errors[f.name] = `${f.label} must be a valid date`
        else data[f.name] = raw
        break
      case 'branch':
      case 'employee': {
        const id = Number(raw)
        if (!Number.isInteger(id)) errors[f.name] = `Select a valid ${f.kind}`
        else data[f.name] = id
        break
      }
      case 'select':
        if (f.options && !f.options.includes(raw)) errors[f.name] = `Choose a valid ${f.label}`
        else data[f.name] = raw
        break
      default:
        data[f.name] = raw
    }
  }
  return { data, errors }
}

/** Keeps what the user typed so a failed save can re-render the form without losing input. */
export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v
  return out
}
