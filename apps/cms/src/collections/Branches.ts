import { options } from '@hr/shared/enums'
import { APIError, type CollectionConfig } from 'payload'

import { hrRecordAccess } from '../access'
import { phone, text } from '../fields'
import { auditHooks } from '../hooks/audit'

const audit = auditHooks('name')

/** Company branches — the "Station / Division / Unit" an employee is assigned to. */
export const Branches: CollectionConfig = {
  slug: 'branches',
  labels: { singular: 'Branch', plural: 'Branches' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'code', 'region', 'address'], group: 'HR Records' },
  access: hrRecordAccess,
  defaultSort: 'name',
  fields: [
    text('name', 'Branch / Station / Division / Unit', { required: true, unique: true, maxLength: 150 }),
    text('code', 'Code', { unique: true, maxLength: 30, admin: { description: 'Optional short code used in Excel imports.' } }),
    text('address', 'Address', { maxLength: 300 }),
    { name: 'region', type: 'select', options: options.regions },
    phone('contactNumber', 'Contact Number'),
    { name: 'notes', type: 'textarea' },
  ],
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const [employees, applications] = await Promise.all([
          req.payload.count({ collection: 'employees', where: { station: { equals: id } }, overrideAccess: true, req }),
          req.payload.count({ collection: 'applications', where: { station: { equals: id } }, overrideAccess: true, req }),
        ])
        if (employees.totalDocs || applications.totalDocs) {
          throw new APIError(
            `This branch still has ${employees.totalDocs} employee(s) and ${applications.totalDocs} application(s). Reassign them first.`,
            400,
            undefined,
            true,
          )
        }
      },
    ],
    ...audit,
  },
}
