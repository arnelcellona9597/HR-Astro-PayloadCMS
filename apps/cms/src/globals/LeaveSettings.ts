import { APIError, type GlobalConfig } from 'payload'

import { isHrAdmin, isStaff } from '../access'
import { diffDocs, writeAudit } from '../hooks/audit'

export const DEFAULT_WELLNESS_ALLOWANCE = 5

export const LeaveSettings: GlobalConfig = {
  slug: 'leave-settings',
  label: 'Wellness Leave Settings',
  admin: { group: 'Settings' },
  access: { read: isStaff, update: isHrAdmin },
  fields: [
    {
      name: 'annualAllowance',
      label: 'Wellness leave days per year',
      type: 'number',
      required: true,
      min: 0,
      max: 60,
      defaultValue: DEFAULT_WELLNESS_ALLOWANCE,
      admin: { description: 'Applies to every year that has no specific override below.' },
    },
    {
      name: 'yearOverrides',
      label: 'Per-year overrides',
      type: 'array',
      admin: {
        description: 'Set a different allowance for a specific year. Past years keep their own value when the default changes.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'year', type: 'number', required: true, min: 2000, max: 2100 },
            { name: 'allowance', label: 'Days', type: 'number', required: true, min: 0, max: 60 },
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        const years = (data?.yearOverrides ?? []).map((o: { year?: number }) => o.year)
        if (new Set(years).size !== years.length) {
          throw new APIError('Each year can only have one override.', 400, undefined, true)
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const changes = diffDocs(previousDoc, doc)
        if (Object.keys(changes).length) {
          await writeAudit(req, { action: 'update', collectionSlug: 'leave-settings', docLabel: 'Wellness Leave Settings', changes })
        }
        return doc
      },
    ],
  },
}

type LeaveSettingsDoc = { annualAllowance?: number | null; yearOverrides?: { year: number; allowance: number }[] | null }

export function allowanceForYear(settings: LeaveSettingsDoc | null | undefined, year: number): number {
  const override = settings?.yearOverrides?.find((o) => o.year === year)
  if (override) return override.allowance
  return settings?.annualAllowance ?? DEFAULT_WELLNESS_ALLOWANCE
}
