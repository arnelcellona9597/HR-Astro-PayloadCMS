import { formatNameLastFirst, sumCentavos, toCentavos, toYmd } from '@hr/shared'
import { APIError, type CollectionConfig, type Field } from 'payload'

import { hrRecordAccess } from '../access'
import { dateOnly, text } from '../fields'
import { auditHooks } from '../hooks/audit'

const relId = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : (v as number | undefined))

export const PayrollPeriods: CollectionConfig = {
  slug: 'payroll-periods',
  labels: { singular: 'Payroll Period', plural: 'Payroll Periods' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'periodStart', 'periodEnd', 'payDate', 'status'], group: 'Payroll' },
  access: hrRecordAccess,
  defaultSort: '-periodStart',
  fields: [
    text('name', 'Period name', { required: true, maxLength: 120, admin: { description: 'e.g. "October 2026 — 1st half"' } }),
    text('code', 'Code', { required: true, unique: true, maxLength: 40, admin: { description: 'Short unique code, e.g. 2026-10-A' } }),
    {
      type: 'row',
      fields: [
        dateOnly('periodStart', 'Period start', { required: true, index: true }),
        dateOnly('periodEnd', 'Period end', {
          required: true,
          validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
            const end = toYmd(value)
            const start = toYmd(siblingData?.periodStart)
            if (!end) return 'Enter the period end date'
            if (start && end < start) return 'Period end is before period start'
            return true
          },
        }),
        dateOnly('payDate', 'Pay date', { required: true }),
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'Draft',
      index: true,
      options: ['Draft', 'Released'].map((v) => ({ label: v, value: v })),
      admin: { description: 'Released periods have been emailed to employees.' },
    },
    { name: 'releasedAt', type: 'date', admin: { readOnly: true } },
    { name: 'releasedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'notes', type: 'textarea' },
  ],
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const n = await req.payload.count({ collection: 'payslips', where: { period: { equals: id } }, overrideAccess: true, req })
        if (n.totalDocs) throw new APIError(`This period still has ${n.totalDocs} payslip(s). Delete them first.`, 400, undefined, true)
      },
    ],
    ...auditHooks('name'),
  },
}

const itemsField = (name: string, label: string): Field => ({
  name,
  label,
  type: 'array',
  maxRows: 30,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'label', type: 'text', required: true, maxLength: 40 },
        {
          name: 'amount',
          type: 'number',
          required: true,
          min: 0,
          validate: (value: unknown) => {
            const r = toCentavos(value)
            return r.ok ? true : `Amount ${r.error}`
          },
        },
      ],
    },
  ],
})

/** Converts arrays of {label, amount} to centavos and checks them. */
export function itemsCentavos(items: { label?: string | null; amount?: number | null }[] | null | undefined): number[] {
  return (items ?? []).map((i) => {
    const r = toCentavos(i.amount ?? 0)
    if (!r.ok) throw new APIError(`${i.label ?? 'Amount'} ${r.error}.`, 400, undefined, true)
    return r.centavos
  })
}

export const Payslips: CollectionConfig = {
  slug: 'payslips',
  labels: { singular: 'Payslip', plural: 'Payslips' },
  admin: { useAsTitle: 'fullName', defaultColumns: ['fullName', 'period', 'grossPay', 'totalDeductions', 'netPay'], group: 'Payroll' },
  access: hrRecordAccess,
  defaultSort: 'fullName',
  indexes: [{ fields: ['period', 'employee'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'period', type: 'relationship', relationTo: 'payroll-periods', required: true, index: true },
        { name: 'employee', type: 'relationship', relationTo: 'employees', required: true, index: true },
      ],
    },
    // Employee details as they were for this period (kept even if the employee record changes later).
    {
      type: 'collapsible',
      label: 'Employee details (copied from the employee record)',
      admin: { initCollapsed: true },
      fields: [
        { type: 'row', fields: [text('fullName', 'Name', { admin: { readOnly: true } }), text('employeeCode', 'Employee ID', { admin: { readOnly: true } })] },
        { type: 'row', fields: [text('position', 'Position', { admin: { readOnly: true } }), text('station', 'Station', { admin: { readOnly: true } }), text('classification', 'Classification', { admin: { readOnly: true } })] },
        { type: 'row', fields: ['tin', 'sss', 'philhealth', 'pagibig'].map((n) => text(n, n.toUpperCase(), { admin: { readOnly: true } })) },
      ],
    },
    itemsField('earnings', 'Earnings'),
    itemsField('deductions', 'Deductions'),
    {
      type: 'row',
      fields: [
        { name: 'grossPay', label: 'Gross pay', type: 'number', admin: { readOnly: true } },
        { name: 'totalDeductions', label: 'Total deductions', type: 'number', admin: { readOnly: true } },
        { name: 'netPay', label: 'Net pay', type: 'number', admin: { readOnly: true } },
      ],
    },
    { name: 'remarks', type: 'textarea' },
    {
      name: 'correctedAfterRelease',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true, description: 'Changed after the payroll was released — consider re-sending it.' },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req, operation }) => {
        const merged = { ...originalDoc, ...data }
        const periodId = relId(merged.period)
        const employeeId = relId(merged.employee)
        if (!periodId || !employeeId) throw new APIError('Choose the payroll period and the employee.', 400, undefined, true)

        const dup = await req.payload.count({
          collection: 'payslips',
          where: {
            and: [
              { period: { equals: periodId } },
              { employee: { equals: employeeId } },
              ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
            ],
          },
          overrideAccess: true,
          req,
        })
        if (dup.totalDocs) throw new APIError('This employee already has a payslip for this period.', 400, undefined, true)

        // Totals are added up in whole centavos — no floating-point drift, no tax formulas.
        const gross = sumCentavos(itemsCentavos(merged.earnings))
        const ded = sumCentavos(itemsCentavos(merged.deductions))
        if (ded > gross) throw new APIError('Total deductions are higher than gross pay. Check the amounts.', 400, undefined, true)
        data.grossPay = gross / 100
        data.totalDeductions = ded / 100
        data.netPay = (gross - ded) / 100

        if (operation === 'create' || relId(originalDoc?.employee) !== employeeId) {
          const emp = await req.payload.findByID({ collection: 'employees', id: employeeId, depth: 1, overrideAccess: true, req })
          data.fullName = formatNameLastFirst(emp)
          data.employeeCode = emp.employeeId
          data.position = emp.position ?? null
          data.station = typeof emp.station === 'object' && emp.station ? emp.station.name : null
          data.classification = emp.classification
          data.tin = emp.tin ?? null
          data.sss = emp.sss ?? null
          data.philhealth = emp.philhealth ?? null
          data.pagibig = emp.pagibig ?? null
        }
        if (operation === 'update') {
          const period = await req.payload.findByID({ collection: 'payroll-periods', id: periodId, depth: 0, overrideAccess: true, req })
          if (period.status === 'Released' && !req.context?.releasing) data.correctedAfterRelease = true
        }
        return data
      },
    ],
    ...auditHooks('fullName'),
  },
}
