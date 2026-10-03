import type { Payload, Where } from 'payload'

/** Templates used by automatic emails. Created on startup if missing; HR can edit the wording. */
export const DEFAULT_TEMPLATES = [
  {
    key: 'leave-filed',
    name: 'Wellness leave filed',
    category: 'Leave',
    subject: 'Wellness leave recorded: {{leaveDates}}',
    body: `Hi {{firstName}},

Your wellness leave has been recorded.

Dates: {{leaveDates}}
Working days: {{leaveDays}}
Status: {{leaveStatus}}
Wellness leave days left this year: {{leaveRemaining}}

If anything here is wrong, please contact the HR office.`,
  },
  {
    key: 'leave-status',
    name: 'Wellness leave status changed',
    category: 'Leave',
    subject: 'Your wellness leave is now {{leaveStatus}}',
    body: `Hi {{firstName}},

The status of your wellness leave on {{leaveDates}} ({{leaveDays}} working day/s) is now: {{leaveStatus}}.

Wellness leave days left this year: {{leaveRemaining}}`,
  },
  {
    key: 'payroll-released',
    name: 'Payroll released (payslip)',
    category: 'Payroll',
    subject: 'Your payslip for {{payPeriod}}',
    body: `Hi {{firstName}},

Payroll for {{payPeriod}} has been released (pay date: {{payDate}}).

Net pay: {{netPay}}

Your payslip is attached as a PDF. Please keep it for your records and contact the HR office if you see any discrepancy.`,
  },
  {
    key: 'requirement-reminder',
    name: 'Annual requirement reminder',
    category: 'Reminder',
    subject: 'Reminder: please submit your {{requirement}} for {{year}}',
    body: `Hi {{firstName}},

Our records show that your {{requirement}} for {{year}} has not been submitted yet. Please submit it to the HR office as soon as possible.

Thank you.`,
  },
  {
    key: null,
    name: 'General announcement',
    category: 'Announcement',
    subject: 'Announcement from {{companyName}}',
    body: `Hi {{firstName}},

[Write your announcement here.]

Thank you,
HR Office`,
  },
  {
    key: null,
    name: 'Payroll schedule notice',
    category: 'Payroll',
    subject: 'Payroll schedule update',
    body: `Hi {{firstName}},

Please be informed that [details of the payroll schedule change].

Thank you,
HR Office`,
  },
] as const

export async function ensureDefaults(payload: Payload) {
  // Templates used by automatic emails are always restored; the extra examples only on a fresh install.
  const fresh = (await payload.count({ collection: 'email-templates', overrideAccess: true })).totalDocs === 0
  for (const t of DEFAULT_TEMPLATES) {
    if (!t.key && !fresh) continue
    const where: Where = t.key ? { key: { equals: t.key } } : { name: { equals: t.name } }
    const exists = await payload.count({ collection: 'email-templates', where, overrideAccess: true })
    if (exists.totalDocs === 0) {
      await payload.create({ collection: 'email-templates', data: { ...t, key: t.key ?? undefined } as never, overrideAccess: true, context: { skipAudit: true } })
    }
  }
  const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
  if (!settings.queueKey) {
    // The beforeChange hook generates the key.
    await payload.updateGlobal({ slug: 'notification-settings', data: {}, overrideAccess: true, context: { skipAudit: true } })
  }
}
