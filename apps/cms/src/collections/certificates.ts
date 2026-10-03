// Certificates of employment.
// - certificate-templates: one per purpose (active, newly hired, resigned, …), laid out as blocks in
//   the drag-and-drop editor.
// - certificates: the numbered log of issued certificates. The text is frozen when issued (template
//   and employee data merged), so a reprint is always identical to the original.
import { CertificateTemplateError, PAPER_SIZES, sanitizeBlocks } from '@hr/shared/certificates'
import { APIError, type CollectionConfig } from 'payload'

import { isStaff, isSystemAdmin } from '../access'
import { dateOnly, text } from '../fields'
import { auditHooks } from '../hooks/audit'
import { buildCertificateContent } from '../server/certificates'

const option = (values: readonly string[]) => values.map((v) => ({ label: v, value: v }))
const templateAudit = auditHooks('name')
const certificateAudit = auditHooks('controlNumber')
const locked = { create: () => false, update: () => false }

export const CertificateTemplates: CollectionConfig = {
  slug: 'certificate-templates',
  labels: { singular: 'Certificate Template', plural: 'Certificate Templates' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'prefix', 'active', 'updatedAt'], group: 'Certificates' },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  defaultSort: 'sortOrder',
  fields: [
    text('name', 'Purpose / template name', { required: true, unique: true, maxLength: 120 }),
    { name: 'description', label: 'When to use it', type: 'textarea', maxLength: 400 },
    text('prefix', 'Control number prefix', {
      required: true,
      defaultValue: 'COE',
      maxLength: 8,
      admin: { description: 'Letters/digits, e.g. COE → COE-2026-0001.' },
      validate: (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{1,8}$/.test(v)) || 'Use 1–8 capital letters or digits.',
    }),
    { name: 'paperSize', type: 'select', required: true, defaultValue: 'A4', options: option(PAPER_SIZES) },
    { name: 'font', type: 'select', required: true, defaultValue: 'serif', options: [{ label: 'Serif (Times)', value: 'serif' }, { label: 'Sans-serif', value: 'sans' }] },
    { name: 'margin', type: 'select', required: true, defaultValue: 'normal', options: option(['narrow', 'normal', 'wide']) },
    { name: 'blocks', type: 'json', required: true, admin: { description: 'Edited in the app: Certificates → Templates.' } },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Inactive templates cannot be used for new certificates.' } },
    { name: 'sortOrder', type: 'number', defaultValue: 100, admin: { position: 'sidebar' } },
    { name: 'key', type: 'text', unique: true, admin: { readOnly: true, position: 'sidebar', description: 'Set on the built-in templates.' } },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && 'blocks' in data) {
          try {
            data.blocks = sanitizeBlocks(data.blocks)
          } catch (err) {
            if (err instanceof CertificateTemplateError) throw new APIError(err.message, 400, undefined, true)
            throw err
          }
        }
        if (data?.prefix) data.prefix = String(data.prefix).trim().toUpperCase()
        return data
      },
    ],
    afterChange: templateAudit.afterChange,
    afterDelete: templateAudit.afterDelete,
  },
  timestamps: true,
}

export const Certificates: CollectionConfig = {
  slug: 'certificates',
  labels: { singular: 'Certificate', plural: 'Certificates' },
  admin: { useAsTitle: 'controlNumber', defaultColumns: ['controlNumber', 'employeeName', 'templateName', 'issuedDate', 'status'], group: 'Certificates' },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isSystemAdmin },
  defaultSort: '-createdAt',
  fields: [
    text('controlNumber', 'Control No.', { unique: true, index: true, access: locked, admin: { readOnly: true } }),
    { name: 'template', type: 'relationship', relationTo: 'certificate-templates', required: true, access: { update: () => false } },
    { name: 'employee', type: 'relationship', relationTo: 'employees', required: true, index: true, access: { update: () => false } },
    text('purpose', 'Purpose / requested for', { maxLength: 200, access: { update: () => false } }),
    dateOnly('issuedDate', 'Date issued', { required: true, access: { update: () => false } }),
    // Snapshots, filled by the server when the certificate is issued.
    text('templateName', 'Certificate', { access: locked, admin: { readOnly: true } }),
    text('employeeName', 'Employee', { index: true, access: locked, admin: { readOnly: true } }),
    { name: 'content', type: 'json', access: locked, admin: { readOnly: true } },
    { name: 'issuedBy', type: 'relationship', relationTo: 'users', access: locked, admin: { readOnly: true } },
    text('issuedByName', 'Issued by', { access: locked, admin: { readOnly: true } }),
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'Valid',
      index: true,
      options: option(['Valid', 'Void']),
      access: { create: () => false },
    },
    text('voidReason', 'Reason for voiding', { maxLength: 300 }),
    { name: 'voidedAt', type: 'date', access: locked, admin: { readOnly: true } },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation === 'create') {
          // Everything printed is computed here, from the template and the employee record.
          Object.assign(data, await buildCertificateContent(req.payload, req, data, req.user))
          data.status = 'Valid'
        } else if (operation === 'update' && originalDoc) {
          if (originalDoc.status === 'Void' && data.status === 'Valid') {
            throw new APIError('A voided certificate cannot be made valid again. Issue a new one instead.', 400, undefined, true)
          }
          if (data.status === 'Void' && originalDoc.status !== 'Void') {
            if (!String(data.voidReason ?? originalDoc.voidReason ?? '').trim()) throw new APIError('Give a reason for voiding the certificate.', 400, undefined, true)
            data.voidedAt = new Date().toISOString()
          }
        }
        return data
      },
    ],
    afterChange: certificateAudit.afterChange,
    afterDelete: certificateAudit.afterDelete,
  },
  timestamps: true,
}
