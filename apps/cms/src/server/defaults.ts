import { sanitizeBlocks } from '@hr/shared/certificates'
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
  await ensureCertificateTemplates(payload)
  const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
  if (!settings.queueKey) {
    // The beforeChange hook generates the key.
    await payload.updateGlobal({ slug: 'notification-settings', data: {}, overrideAccess: true, context: { skipAudit: true } })
  }
}

// ---------------------------------------------------------------------------------------------
// Certificates of employment: starter templates (created once, on an empty install; HR edits them).
// ---------------------------------------------------------------------------------------------
const letterhead = { type: 'header', showLogo: true, companyName: '', lines: '', align: 'center' }
const signature = {
  type: 'signatory',
  align: 'right',
  signers: [{ label: '', name: '', title: 'Human Resource Officer' }],
}
const footnote = { type: 'footer', text: 'Control No. {{controlNumber}} · Not valid without the official dry seal.', align: 'left' }
const toWhom = { type: 'paragraph', text: '**TO WHOM IT MAY CONCERN:**', align: 'left', size: 'md', indent: false }
const issued = { type: 'paragraph', text: 'Issued this {{issuedDay}} day of {{issuedMonthYear}}.', align: 'justify', size: 'md', indent: true }
const title = (text: string) => ({ type: 'title', text, size: 'lg', align: 'center', wide: true })
const para = (text: string) => ({ type: 'paragraph', text, align: 'justify', size: 'md', indent: true })
const space = (size: string) => ({ type: 'spacer', size })

export const DEFAULT_CERTIFICATE_TEMPLATES = [
  {
    key: 'coe-active',
    name: 'Certificate of Employment',
    description: 'For current employees: loans, bank, visa, scholarship and other general purposes.',
    sortOrder: 10,
    blocks: [
      letterhead,
      { type: 'divider' },
      space('lg'),
      title('CERTIFICATE OF EMPLOYMENT'),
      space('lg'),
      toWhom,
      para(
        'This is to certify that **{{honorific}} {{fullNameUpper}}** is a {{classification}} employee of {{companyName}}, presently holding the position of **{{position}}** at {{station}}. {{pronounCap}} has been with the office since {{dateHired}} up to the present.',
      ),
      para('This certification is issued upon the request of {{honorific}} {{lastName}} for {{purpose}}.'),
      issued,
      space('xl'),
      signature,
      space('xl'),
      footnote,
    ],
  },
  {
    key: 'coe-newly-hired',
    name: 'Certificate of Employment – Newly Hired',
    description: 'For new employees who need proof of employment (e.g. payroll account, government IDs).',
    sortOrder: 20,
    blocks: [
      letterhead,
      { type: 'divider' },
      space('lg'),
      title('CERTIFICATE OF EMPLOYMENT'),
      space('lg'),
      toWhom,
      para(
        'This is to certify that **{{honorific}} {{fullNameUpper}}** has been hired by {{companyName}} as **{{position}}** ({{classification}}) assigned at {{station}}, effective {{dateHired}}.',
      ),
      para('This certification is issued upon the request of {{honorific}} {{lastName}} for {{purpose}}.'),
      issued,
      space('xl'),
      signature,
      space('xl'),
      footnote,
    ],
  },
  {
    key: 'coe-separated',
    name: 'Certificate of Employment – Resigned / Separated',
    description: 'For former employees (resigned, retired or terminated): dates and length of service.',
    sortOrder: 30,
    blocks: [
      letterhead,
      { type: 'divider' },
      space('lg'),
      title('CERTIFICATE OF EMPLOYMENT'),
      space('lg'),
      toWhom,
      para(
        'This is to certify that **{{honorific}} {{fullNameUpper}}** was employed by {{companyName}} as **{{position}}** ({{classification}}) at {{station}} from {{dateHired}} until {{pronoun}} {{separation}} on {{lastDayOfService}}, a total service of {{lengthOfService}}.',
      ),
      para('This certification is issued upon the request of {{honorific}} {{lastName}} for {{purpose}}.'),
      issued,
      space('xl'),
      signature,
      space('xl'),
      footnote,
    ],
  },
]

export async function ensureCertificateTemplates(payload: Payload) {
  const { totalDocs } = await payload.count({ collection: 'certificate-templates', overrideAccess: true })
  if (totalDocs > 0) return
  for (const t of DEFAULT_CERTIFICATE_TEMPLATES) {
    await payload.create({
      collection: 'certificate-templates',
      data: { ...t, prefix: 'COE', paperSize: 'A4', font: 'serif', margin: 'normal', active: true, blocks: sanitizeBlocks(t.blocks) } as never,
      overrideAccess: true,
      context: { skipAudit: true },
    })
  }
}
