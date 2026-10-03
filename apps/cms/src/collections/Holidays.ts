import type { CollectionConfig } from 'payload'

import { hrRecordAccess } from '../access'
import { dateOnly, text } from '../fields'
import { auditHooks } from '../hooks/audit'

const audit = auditHooks('name')

/** Non-working days excluded when counting wellness leave days. */
export const Holidays: CollectionConfig = {
  slug: 'holidays',
  labels: { singular: 'Holiday', plural: 'Holidays' },
  admin: { useAsTitle: 'name', defaultColumns: ['date', 'name', 'type'], group: 'Settings' },
  access: hrRecordAccess,
  defaultSort: 'date',
  fields: [
    dateOnly('date', 'Date', { required: true, unique: true, index: true }),
    text('name', 'Name', { required: true, maxLength: 120 }),
    {
      name: 'type',
      type: 'select',
      defaultValue: 'Regular Holiday',
      options: ['Regular Holiday', 'Special Non-Working Day', 'Local Holiday', 'Office Closure'].map((v) => ({
        label: v,
        value: v,
      })),
    },
  ],
  hooks: audit,
}
