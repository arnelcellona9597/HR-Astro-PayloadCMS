// {{placeholder}} rendering for email templates.

export const MERGE_FIELDS: { name: string; description: string }[] = [
  { name: 'firstName', description: 'Recipient first name' },
  { name: 'lastName', description: 'Recipient last name' },
  { name: 'fullName', description: 'Recipient full name' },
  { name: 'employeeId', description: 'Employee ID (employees only)' },
  { name: 'position', description: 'Position / designation' },
  { name: 'station', description: 'Station / branch' },
  { name: 'leaveRemaining', description: 'Wellness leave days left this year' },
  { name: 'companyName', description: 'Company name from Branding' },
]

/** Extra fields available only in automatic notifications. */
export const CONTEXT_MERGE_FIELDS: { name: string; description: string }[] = [
  { name: 'leaveDates', description: 'Inclusive dates of the leave filing' },
  { name: 'leaveDays', description: 'Working days in the filing' },
  { name: 'leaveStatus', description: 'Status of the filing' },
  { name: 'payPeriod', description: 'Payroll period name' },
  { name: 'payDate', description: 'Payroll pay date' },
  { name: 'netPay', description: 'Net pay on the payslip' },
  { name: 'requirement', description: 'Annual requirement name' },
  { name: 'year', description: 'Year' },
]

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g

export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!))]
}

/** Placeholders in `text` that are not in `allowed`. */
export function unknownPlaceholders(text: string, allowed: string[]): string[] {
  return findPlaceholders(text).filter((p) => !allowed.includes(p))
}

/** Replaces {{name}} with values[name]; missing values become an empty string. */
export function renderTemplate(text: string, values: Record<string, string | number | null | undefined>): string {
  return text.replace(PLACEHOLDER_RE, (_, name: string) => {
    const v = values[name]
    return v === null || v === undefined ? '' : String(v)
  })
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!)

/** Plain text → safe HTML paragraphs with line breaks and clickable links. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para)
        .replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`)
        .replace(/\n/g, '<br>')
      return `<p style="margin:0 0 14px">${html}</p>`
    })
    .join('')
}
