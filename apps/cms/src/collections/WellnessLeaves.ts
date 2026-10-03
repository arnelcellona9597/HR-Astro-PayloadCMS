import { toYmd } from '@hr/shared'
import { APIError, type CollectionConfig } from 'payload'

import { hrRecordAccess } from '../access'
import { dateOnly, nameSnapshotFields } from '../fields'
import { auditHooks } from '../hooks/audit'
import { checkLeave, LEAVE_STATUSES } from '../server/leave'

const audit = auditHooks('lastName')

const relId = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : (v as number | undefined))

export const WellnessLeaves: CollectionConfig = {
  slug: 'wellness-leaves',
  labels: { singular: 'Wellness Leave', plural: 'Wellness Leaves' },
  admin: {
    useAsTitle: 'lastName',
    defaultColumns: ['lastName', 'firstName', 'dateFiling', 'inclusiveDateFrom', 'inclusiveDateTo', 'days', 'status'],
    group: 'HR Records',
  },
  access: hrRecordAccess,
  defaultSort: '-dateFiling',
  fields: [
    { name: 'employee', type: 'relationship', relationTo: 'employees', required: true, index: true },
    ...nameSnapshotFields(false),
    {
      type: 'row',
      fields: [
        dateOnly('dateFiling', 'Date Filing', { required: true, index: true }),
        dateOnly('inclusiveDateFrom', 'Inclusive Date (From)', { required: true, index: true }),
        dateOnly('inclusiveDateTo', 'Inclusive Date (To)', { required: true, index: true }),
        dateOnly('dateReceived', 'Date Received', {
          validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
            const rec = toYmd(value)
            const filed = toYmd(siblingData?.dateFiling)
            if (value && !rec) return 'Invalid date'
            if (rec && filed && rec < filed) return 'Date received cannot be before the filing date'
            return true
          },
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'Approved',
          options: LEAVE_STATUSES.map((v) => ({ label: v, value: v })),
          index: true,
          admin: { description: 'Disapproved and cancelled filings do not use up leave days.' },
        },
        { name: 'days', label: 'Working days', type: 'number', admin: { readOnly: true } },
        { name: 'year', type: 'number', index: true, admin: { readOnly: true } },
      ],
    },
    // Working days charged to each calendar year, e.g. {"2024": 2, "2025": 1}
    { name: 'daysByYear', type: 'json', admin: { readOnly: true, hidden: true } },
    { name: 'remarks', type: 'textarea' },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const merged = { ...originalDoc, ...data }
        const employeeId = relId(merged.employee)
        if (!employeeId) throw new APIError('Select an employee.', 400, undefined, true)

        const result = await checkLeave(
          req.payload,
          {
            employee: employeeId,
            from: merged.inclusiveDateFrom,
            to: merged.inclusiveDateTo,
            status: merged.status,
            excludeId: originalDoc?.id,
          },
          req,
        )
        if (!result.ok) throw new APIError(result.error ?? 'Invalid leave filing.', 400, undefined, true)

        const employee = await req.payload.findByID({
          collection: 'employees',
          id: employeeId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        data.lastName = employee.lastName
        data.firstName = employee.firstName
        data.middleName = employee.middleName ?? null
        data.days = result.count!.total
        data.daysByYear = Object.fromEntries(Object.entries(result.count!.byYear).map(([y, d]) => [String(y), d]))
        data.year = Number(toYmd(merged.inclusiveDateFrom)!.slice(0, 4))
        return data
      },
    ],
    ...audit,
  },
}
