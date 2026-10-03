import { ONBOARDING_REQUIREMENTS, options, toYmd, type RequirementStatus } from '@hr/shared'
import type { CollectionConfig, Field } from 'payload'

import { hrRecordAccess } from '../access'
import { dateOnly, text } from '../fields'
import { auditHooks } from '../hooks/audit'

const audit = auditHooks('applicantName')

const DONE: RequirementStatus[] = ['Submitted', 'Verified']

/** Outstanding onboarding documents — anything not yet Submitted/Verified and not marked N/A. */
export function missingRequirements(doc: Record<string, unknown>): string[] {
  return ONBOARDING_REQUIREMENTS.filter((r) => {
    const v = (doc[r.key] as RequirementStatus | undefined) ?? 'Pending'
    return v !== 'N/A' && !DONE.includes(v)
  }).map((r) => r.label)
}

const requirementFields: Field[] = ONBOARDING_REQUIREMENTS.map(
  (r): Field => ({
    name: r.key,
    label: r.label,
    type: 'select',
    options: options.requirementStatuses,
    required: true,
    defaultValue: 'Pending',
    admin: { width: '20%' },
  }),
)

export const Applications: CollectionConfig = {
  slug: 'applications',
  labels: { singular: 'Application', plural: 'Onboarding Tracker' },
  admin: {
    useAsTitle: 'applicantName',
    defaultColumns: ['applicationId', 'applicantName', 'positionApplied', 'station', 'applicationStatus', 'requirementsStatus'],
    group: 'HR Records',
  },
  access: hrRecordAccess,
  defaultSort: '-dateApplied',
  fields: [
    {
      type: 'row',
      fields: [
        text('applicationId', 'Application ID', { required: true, unique: true, maxLength: 40 }),
        text('applicantName', 'Applicant Name', { required: true, index: true, maxLength: 200 }),
      ],
    },
    {
      type: 'row',
      fields: [
        text('positionApplied', 'Position Applied', { required: true, index: true, maxLength: 150 }),
        { name: 'station', label: 'Station', type: 'relationship', relationTo: 'branches', index: true },
        text('replacement', 'Replacement', {
          maxLength: 200,
          admin: { description: 'Name of the employee being replaced, if any.' },
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        dateOnly('dateApplied', 'Date Applied', { required: true, index: true }),
        dateOnly('startOjt', 'Start OJT', {
          validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
            const ojt = toYmd(value)
            const applied = toYmd(siblingData?.dateApplied)
            if (value && !ojt) return 'Invalid date'
            if (ojt && applied && ojt < applied) return 'Start OJT cannot be before the date applied'
            return true
          },
        }),
        {
          name: 'applicationStatus',
          label: 'Application Status',
          type: 'select',
          options: options.applicationStatuses,
          required: true,
          defaultValue: 'Pending',
          index: true,
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Requirements',
      fields: [{ type: 'row', fields: requirementFields }],
    },
    {
      type: 'row',
      fields: [
        dateOnly('dateSubmitted', 'Date Submitted'),
        {
          name: 'requirementsStatus',
          label: 'FDS Requirements Status',
          type: 'select',
          options: [
            { label: 'Complete', value: 'Complete' },
            { label: 'Incomplete', value: 'Incomplete' },
          ],
          index: true,
          admin: { readOnly: true, description: 'Computed: Complete when every requirement is Submitted, Verified or N/A.' },
        },
        { name: 'requirementsMissing', label: 'Missing', type: 'number', admin: { readOnly: true } },
      ],
    },
    { name: 'remarks', type: 'textarea' },
    {
      name: 'employee',
      label: 'Employee record',
      type: 'relationship',
      relationTo: 'employees',
      admin: { description: 'Linked automatically when the applicant is converted to an employee.' },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const missing = missingRequirements({ ...originalDoc, ...data })
        data.requirementsMissing = missing.length
        data.requirementsStatus = missing.length === 0 ? 'Complete' : 'Incomplete'
        return data
      },
    ],
    ...audit,
  },
}
