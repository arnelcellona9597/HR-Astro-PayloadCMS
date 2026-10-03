import { APIError, type GlobalConfig } from 'payload'

import { isStaff } from '../access'
import { diffDocs, writeAudit } from '../hooks/audit'

export const DEFAULT_EARNINGS = ['Basic Pay', 'PERA', 'Overtime', 'Allowances']
export const DEFAULT_DEDUCTIONS = ['Withholding Tax', 'GSIS / SSS', 'PhilHealth', 'Pag-IBIG', 'Loans']

const labels = (name: string, label: string, defaults: string[]) => ({
  name,
  label,
  type: 'array' as const,
  minRows: 1,
  maxRows: 15,
  defaultValue: defaults.map((l) => ({ label: l })),
  admin: { description: 'These become the columns of the payroll grid, Excel sheet and payslip. Order matters.' },
  fields: [{ name: 'label', type: 'text' as const, required: true, maxLength: 40 }],
})

/** The payslip "template": what a printed/PDF payslip shows and which pay items HR records. */
export const PayslipSettings: GlobalConfig = {
  slug: 'payslip-settings',
  label: 'Payslip Template',
  admin: { group: 'Settings' },
  access: { read: isStaff, update: isStaff },
  fields: [
    { name: 'title', type: 'text', required: true, defaultValue: 'PAYSLIP', maxLength: 60 },
    {
      name: 'companyName',
      label: 'Company name on payslip',
      type: 'text',
      admin: { description: 'Leave blank to use the name from Branding.' },
    },
    { name: 'addressLines', label: 'Address / header lines', type: 'textarea', admin: { description: 'One line per row, e.g. address, TIN, contact number.' } },
    { name: 'showLogo', type: 'checkbox', defaultValue: true },
    { name: 'currencySymbol', type: 'text', defaultValue: '₱', maxLength: 5 },
    labels('earningItems', 'Earning items', DEFAULT_EARNINGS),
    labels('deductionItems', 'Deduction items', DEFAULT_DEDUCTIONS),
    {
      name: 'show',
      label: 'Employee details shown on the payslip',
      type: 'group',
      fields: [
        { type: 'row', fields: ['employeeId', 'position', 'station', 'classification'].map((n) => ({ name: n, type: 'checkbox' as const, defaultValue: true })) },
        { type: 'row', fields: ['tin', 'sss', 'philhealth', 'pagibig'].map((n) => ({ name: n, type: 'checkbox' as const, defaultValue: false })) },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'preparedByName', type: 'text' },
        { name: 'preparedByTitle', type: 'text', defaultValue: 'HR Officer' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'certifiedByName', type: 'text' },
        { name: 'certifiedByTitle', type: 'text', defaultValue: 'Head of Office' },
      ],
    },
    { name: 'footerNote', type: 'textarea', defaultValue: 'This is a system-generated payslip. Please report any discrepancy to the HR office.' },
    {
      name: 'paperSize',
      type: 'select',
      required: true,
      defaultValue: 'A4',
      options: ['A4', 'Letter', 'Half-Letter'].map((v) => ({ label: v, value: v })),
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        for (const key of ['earningItems', 'deductionItems'] as const) {
          const names = ((data?.[key] ?? []) as { label?: string }[]).map((r) => (r.label ?? '').trim().toLowerCase())
          if (new Set(names).size !== names.length) throw new APIError('Pay item names must be unique.', 400, undefined, true)
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const changes = diffDocs(previousDoc, doc)
        if (Object.keys(changes).length) await writeAudit(req, { action: 'update', collectionSlug: 'payslip-settings', docLabel: 'Payslip Template', changes })
        return doc
      },
    ],
  },
}
