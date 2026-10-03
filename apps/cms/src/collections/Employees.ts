import {
  ageOn,
  formatNameLastFirst,
  formatSpan,
  lengthOfService,
  options,
  todayYmd,
  toYmd,
} from '@hr/shared'
import { APIError, type CollectionConfig } from 'payload'

import { hrRecordAccess } from '../access'
import { dateOnly, email, govId, phone, text } from '../fields'
import { auditHooks } from '../hooks/audit'

const audit = auditHooks('fullName')

type EmployeeData = Record<string, unknown>

export const Employees: CollectionConfig = {
  slug: 'employees',
  labels: { singular: 'Employee', plural: 'Employees' },
  admin: {
    useAsTitle: 'fullName',
    defaultColumns: ['employeeId', 'fullName', 'position', 'station', 'classification', 'employmentStatus'],
    listSearchableFields: ['fullName', 'employeeId', 'email', 'position'],
    group: 'HR Records',
  },
  access: hrRecordAccess,
  defaultSort: 'lastName',
  versions: { maxPerDoc: 50 },
  fields: [
    // Stored copy of "LAST, First M. Ext." for sorting, searching and relationship labels.
    { name: 'fullName', type: 'text', index: true, admin: { readOnly: true, hidden: true } },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Personal',
          fields: [
            { name: 'profilePicture', type: 'upload', relationTo: 'media' },
            {
              type: 'row',
              fields: [
                text('lastName', 'Last Name', { required: true, index: true, maxLength: 80 }),
                text('firstName', 'First Name', { required: true, index: true, maxLength: 80 }),
                text('middleName', 'Middle Name', { maxLength: 80 }),
                text('extension', 'Extn.', { maxLength: 10, admin: { width: '90px' } }),
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'gender', type: 'select', options: options.genders, required: true, index: true },
                dateOnly('dateOfBirth', 'Date of Birth', {
                  validate: (value: unknown) => {
                    const ymd = toYmd(value)
                    if (value && !ymd) return 'Invalid date'
                    if (ymd && ymd > todayYmd()) return 'Date of birth cannot be in the future'
                    return true
                  },
                }),
                {
                  name: 'age',
                  type: 'number',
                  virtual: true,
                  admin: { readOnly: true, description: 'Computed from date of birth' },
                  hooks: { afterRead: [({ siblingData }) => ageOn(toYmd(siblingData?.dateOfBirth) ?? '') ?? null] },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'civilStatus', type: 'select', options: options.civilStatuses, index: true },
                text('religion', 'Religion', { maxLength: 80 }),
                { name: 'bloodType', type: 'select', options: options.bloodTypes },
              ],
            },
            text('professionalEligibility', 'Professional Eligibility / License', { maxLength: 200 }),
            { type: 'row', fields: [phone('contactNumber', 'Contact Number'), email('email', 'Email Address', { index: true })] },
            text('address', 'Address', { maxLength: 300 }),
          ],
        },
        {
          label: 'Education',
          fields: [
            { name: 'educationalAttainment', type: 'select', options: options.educationalAttainments, index: true },
            text('courses', 'Courses', { maxLength: 300 }),
            text('yearLevelEarnedUnits', 'Year Level / Earned Units', { maxLength: 120 }),
            text('academicHonors', 'Academic Honors Received', { maxLength: 300 }),
          ],
        },
        {
          label: 'Employment',
          fields: [
            {
              type: 'row',
              fields: [
                text('employeeId', 'Employee ID', { required: true, unique: true, maxLength: 40 }),
                {
                  name: 'classification',
                  type: 'select',
                  options: options.classifications,
                  required: true,
                  index: true,
                },
                {
                  name: 'employmentStatus',
                  label: 'Employment Status',
                  type: 'select',
                  options: options.employmentStatuses,
                  required: true,
                  defaultValue: 'Active',
                  index: true,
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'station',
                  label: 'Station / Division / Unit',
                  type: 'relationship',
                  relationTo: 'branches',
                  index: true,
                },
                { name: 'region', type: 'select', options: options.regions, index: true },
              ],
            },
            {
              type: 'row',
              fields: [
                text('position', 'Position / Designation', { index: true, maxLength: 150 }),
                text('natureOfWork', 'Nature of Work', { maxLength: 150 }),
              ],
            },
            text('driverLicenseNumber', 'Driver License Number', { maxLength: 40 }),
            {
              type: 'row',
              fields: [
                dateOnly('dateHired', 'Date Hired', { index: true }),
                dateOnly('lastDayOfService', 'Last Day of Service', {
                  validate: (value: unknown, { siblingData }: { siblingData: EmployeeData }) => {
                    const end = toYmd(value)
                    const start = toYmd(siblingData?.dateHired)
                    if (value && !end) return 'Invalid date'
                    if (end && start && end < start) return 'Last day of service cannot be before the date hired'
                    return true
                  },
                }),
                {
                  name: 'lengthOfService',
                  label: 'Length in Service',
                  type: 'text',
                  virtual: true,
                  admin: { readOnly: true },
                  hooks: {
                    afterRead: [
                      ({ siblingData }) =>
                        formatSpan(lengthOfService(toYmd(siblingData?.dateHired), toYmd(siblingData?.lastDayOfService))),
                    ],
                  },
                },
              ],
            },
            { name: 'remarks', label: 'Remark', type: 'textarea' },
          ],
        },
        {
          label: 'Government IDs',
          fields: [
            {
              type: 'row',
              fields: [
                govId('sss', 'sss', 'SSS Number'),
                govId('pagibig', 'pagibig', 'Pag-IBIG Number'),
              ],
            },
            {
              type: 'row',
              fields: [govId('tin', 'tin', 'TIN Number'), govId('philhealth', 'philhealth', 'PhilHealth Number')],
            },
          ],
        },
        {
          label: 'Emergency Contact',
          fields: [
            {
              type: 'row',
              fields: [
                text('emergencyContactName', 'Emergency Contact Person', { maxLength: 150 }),
                text('emergencyRelationship', 'Relationship', { maxLength: 60 }),
                phone('emergencyContactNumber', 'Contact Number'),
              ],
            },
            text('emergencyAddress', 'Address', { maxLength: 300 }),
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        // Deleting would orphan leave and compliance history; HR should change the status instead.
        const linked = ['wellness-leaves', 'itr-submissions', 'sworn-declarations', 'pds-submissions', 'ipcr-ratings'] as const
        const counts = await Promise.all(
          linked.map((collection) =>
            req.payload.count({ collection, where: { employee: { equals: id } }, overrideAccess: true, req }),
          ),
        )
        const total = counts.reduce((sum, c) => sum + c.totalDocs, 0)
        if (total > 0) {
          throw new APIError(
            `This employee has ${total} leave/requirement record(s). Set the employment status to Resigned, Retired or Terminated instead of deleting.`,
            400,
            undefined,
            true,
          )
        }
      },
    ],
    beforeChange: [
      ({ data, originalDoc }) => {
        const merged = { ...originalDoc, ...data }
        data.fullName = formatNameLastFirst(merged)
        return data
      },
    ],
    ...audit,
  },
}
