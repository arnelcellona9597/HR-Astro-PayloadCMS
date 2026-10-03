import { adjectivalRating, IPCR_MAX, IPCR_MIN, options, roundRating, toYmd } from '@hr/shared'
import { APIError, type CollectionConfig, type Field, type Where } from 'payload'

import { hrRecordAccess } from '../access'
import { dateOnly, text } from '../fields'
import { auditHooks } from '../hooks/audit'

const relId = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : (v as number | undefined))

const currentYear = () => Number(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }))

export const COMPLIANCE_SLUGS = ['itr-submissions', 'sworn-declarations', 'pds-submissions', 'ipcr-ratings'] as const
export type ComplianceSlug = (typeof COMPLIANCE_SLUGS)[number]

type SnapshotKey = 'extension' | 'station' | 'jobTitle' | 'tin'

type Options = {
  slug: ComplianceSlug
  singular: string
  plural: string
  /** Employee details copied onto each record (editable, default from the employee). */
  snapshot: SnapshotKey[]
  /** Extra fields specific to the requirement. */
  fields: Field[]
  /** Extra fields that, with employee + year, must be unique (e.g. IPCR rating period). */
  uniqueWith?: string[]
  beforeChange?: (data: Record<string, unknown>, merged: Record<string, unknown>) => void
}

const receivedDate = dateOnly('dateReceived', 'Date Received', {
  validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
    const rec = toYmd(value)
    const sub = toYmd(siblingData?.dateSubmitted)
    if (value && !rec) return 'Invalid date'
    if (rec && sub && rec < sub) return 'Date received cannot be before the date submitted'
    return true
  },
})

function createComplianceCollection(o: Options): CollectionConfig {
  const audit = auditHooks('lastName')
  const snapshotFields: Field[] = [
    text('lastName', 'Last Name', { admin: { width: '25%' } }),
    text('firstName', 'First Name', { admin: { width: '25%' } }),
    text('middleName', 'Middle Name', { admin: { width: '25%' } }),
    ...(o.snapshot.includes('extension') ? [text('extension', 'Ext.', { admin: { width: '10%' } })] : []),
  ]
  const workFields: Field[] = [
    ...(o.snapshot.includes('station') ? [text('station', 'Station / Division / Unit')] : []),
    ...(o.snapshot.includes('jobTitle') ? [text('jobTitle', 'Job Title')] : []),
    ...(o.snapshot.includes('tin') ? [text('tin', 'TIN Number')] : []),
  ]

  return {
    slug: o.slug,
    labels: { singular: o.singular, plural: o.plural },
    admin: {
      useAsTitle: 'lastName',
      defaultColumns: ['year', 'lastName', 'firstName', 'dateSubmitted', 'remarks'],
      group: 'Annual Requirements',
    },
    access: hrRecordAccess,
    defaultSort: '-year',
    indexes: [{ fields: ['employee', 'year', ...(o.uniqueWith ?? [])], unique: true }],
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'employee', type: 'relationship', relationTo: 'employees', required: true, index: true },
          {
            name: 'year',
            type: 'number',
            required: true,
            index: true,
            min: 2000,
            max: 2100,
            defaultValue: currentYear,
            admin: { width: '120px' },
          },
        ],
      },
      { type: 'row', fields: snapshotFields },
      ...(workFields.length ? [{ type: 'row', fields: workFields } as Field] : []),
      ...o.fields,
      { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    hooks: {
      beforeChange: [
        async ({ data, originalDoc, req }) => {
          const merged = { ...originalDoc, ...data }
          const employeeId = relId(merged.employee)
          if (!employeeId) throw new APIError('Select an employee.', 400, undefined, true)

          // Friendly duplicate check (the unique index is the hard guarantee).
          const where: Where = {
            and: [
              { employee: { equals: employeeId } },
              { year: { equals: merged.year } },
              ...(o.uniqueWith ?? []).map((f) => ({ [f]: { equals: merged[f] } })),
              ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
            ],
          }
          const dup = await req.payload.count({ collection: o.slug, where, overrideAccess: true, req })
          if (dup.totalDocs > 0) {
            throw new APIError(`This employee already has a ${o.singular} record for ${merged.year}.`, 400, undefined, true)
          }

          // Fill missing snapshot details from the employee record.
          const employeeChanged = relId(originalDoc?.employee) !== employeeId
          const emp = await req.payload.findByID({ collection: 'employees', id: employeeId, depth: 1, overrideAccess: true, req })
          const source: Record<string, unknown> = {
            lastName: emp.lastName,
            firstName: emp.firstName,
            middleName: emp.middleName,
            extension: emp.extension,
            station: typeof emp.station === 'object' && emp.station ? emp.station.name : null,
            jobTitle: emp.position,
            tin: emp.tin,
          }
          const keys = ['lastName', 'firstName', 'middleName', ...o.snapshot]
          for (const key of keys) {
            if (employeeChanged || merged[key] == null || merged[key] === '') data[key] = source[key] ?? null
          }
          o.beforeChange?.(data, merged)
          return data
        },
      ],
      ...audit,
    },
  }
}

export const ItrSubmissions = createComplianceCollection({
  slug: 'itr-submissions',
  singular: 'Annual Income Tax Return',
  plural: 'Annual Income Tax Returns',
  snapshot: ['extension'],
  fields: [{ type: 'row', fields: [dateOnly('dateSubmitted', 'Date Submitted'), receivedDate] }],
})

export const SwornDeclarations = createComplianceCollection({
  slug: 'sworn-declarations',
  singular: 'Sworn Declaration',
  plural: 'Sworn Declarations',
  snapshot: ['station', 'jobTitle', 'tin'],
  fields: [{ type: 'row', fields: [dateOnly('dateSubmitted', 'Date Submitted'), receivedDate] }],
})

export const PdsSubmissions = createComplianceCollection({
  slug: 'pds-submissions',
  singular: 'Personal Data Sheet',
  plural: 'Personal Data Sheets',
  snapshot: ['station', 'jobTitle'],
  fields: [{ type: 'row', fields: [dateOnly('dateSubmitted', 'Date Submitted'), receivedDate] }],
})

export const IpcrRatings = createComplianceCollection({
  slug: 'ipcr-ratings',
  singular: 'IPCR Rating',
  plural: 'IPCR Ratings',
  snapshot: ['station', 'jobTitle'],
  uniqueWith: ['ratingPeriod'],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'ratingPeriod', label: 'Rating Period', type: 'select', required: true, options: options.ipcrPeriods },
        dateOnly('periodFrom', 'Period From'),
        dateOnly('periodTo', 'Period To', {
          validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
            const to = toYmd(value)
            const from = toYmd(siblingData?.periodFrom)
            if (value && !to) return 'Invalid date'
            if (to && from && to < from) return 'Period end is before period start'
            return true
          },
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'rating',
          label: 'Numerical Rating',
          type: 'number',
          min: IPCR_MIN,
          max: IPCR_MAX,
          admin: { step: 0.001, description: '1.000 – 5.000' },
        },
        { name: 'adjectivalRating', label: 'Adjectival Rating', type: 'text', admin: { readOnly: true } },
      ],
    },
    { type: 'row', fields: [dateOnly('dateSubmitted', 'Date Submitted'), receivedDate] },
  ],
  beforeChange: (data, merged) => {
    if (typeof data.rating === 'number') data.rating = roundRating(data.rating)
    const rating = 'rating' in data ? data.rating : merged.rating
    data.adjectivalRating = adjectivalRating(rating as number | null) || null
  },
})

export const ComplianceCollections = [ItrSubmissions, SwornDeclarations, PdsSubmissions, IpcrRatings]
