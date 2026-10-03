import type { QueueInput } from '@hr/cms/server/mailer'
import { CLASSIFICATIONS, EMPLOYMENT_STATUSES, validateEmail } from '@hr/shared'

import type { User } from '@hr/cms/types'

export const MESSAGE_CATEGORIES = ['Announcement', 'Leave', 'Payroll', 'Reminder', 'General'] as const

const ints = (fd: FormData, k: string) => fd.getAll(k).map(Number).filter((n) => Number.isInteger(n) && n > 0)

/** Reads the compose form into a mailer request. Returns an error message for bad input. */
export function parseCompose(fd: FormData, user: User | null): { input?: QueueInput; error?: string; labels: string[] } {
  const subject = String(fd.get('subject') ?? '').trim()
  const body = String(fd.get('body') ?? '').trim()
  const category = String(fd.get('category') ?? 'General')
  const labels: string[] = []
  if (!subject) return { error: 'Enter a subject.', labels }
  if (!body) return { error: 'Write the message.', labels }
  if (subject.length > 200) return { error: 'The subject is too long (200 characters max).', labels }

  const employeeIds = ints(fd, 'employees')
  const allActive = fd.get('allActive') === 'on'
  const branch = ints(fd, 'groupBranch')
  const classification = fd.getAll('groupClassification').map(String).filter((c) => (CLASSIFICATIONS as readonly string[]).includes(c))
  const status = fd.getAll('groupStatus').map(String).filter((c) => (EMPLOYMENT_STATUSES as readonly string[]).includes(c))
  const userIds = ints(fd, 'users')
  const allUsers = fd.get('allUsers') === 'on'
  const emails = String(fd.get('emails') ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
  const badEmail = emails.find((e) => validateEmail(e))
  if (badEmail) return { error: `"${badEmail}" is not a valid email address.`, labels }

  const hasGroup = allActive || branch.length || classification.length || status.length
  if (employeeIds.length) labels.push(`${employeeIds.length} selected employee(s)`)
  if (hasGroup) {
    const parts = [allActive ? 'active' : '', status.join('/'), classification.join('/')].filter(Boolean).join(' ')
    labels.push(`${parts || 'all'} employees${branch.length ? ` in ${branch.length} branch(es)` : ''}`.trim())
  }
  if (allUsers) labels.push('all HR users')
  else if (userIds.length) labels.push(`${userIds.length} HR user(s)`)
  if (emails.length) labels.push(`${emails.length} other address(es)`)
  if (!labels.length) return { error: 'Choose at least one recipient.', labels }

  const context: Record<string, string> = {}
  for (const [k, v] of fd.entries()) if (k.startsWith('ctx_') && typeof v === 'string') context[k.slice(4)] = v

  return {
    labels,
    input: {
      subject,
      body,
      category: (MESSAGE_CATEGORIES as readonly string[]).includes(category) ? category : 'General',
      audience: {
        employeeIds,
        employeeFilter: hasGroup ? { allActive, branch, classification, status } : undefined,
        userIds,
        allUsers,
        emails,
      },
      audienceLabel: labels.join(', '),
      context,
      sentBy: user ? { id: user.id, name: user.name, email: user.email } : null,
    },
  }
}
