import type { CollectionConfig } from 'payload'

import { isHrAdmin, nobody } from '../access'

/** History of Excel imports: who imported what, and the outcome. Written by the import service only. */
export const ImportJobs: CollectionConfig = {
  slug: 'import-jobs',
  labels: { singular: 'Import', plural: 'Import History' },
  admin: {
    group: 'Administration',
    useAsTitle: 'fileName',
    defaultColumns: ['createdAt', 'fileName', 'module', 'status', 'userName'],
  },
  access: { read: isHrAdmin, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'fileName', type: 'text', required: true },
    { name: 'module', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['committed', 'failed'].map((v) => ({ label: v, value: v })),
    },
    { name: 'created', type: 'number' },
    { name: 'updated', type: 'number' },
    { name: 'unchanged', type: 'number' },
    { name: 'error', type: 'textarea' },
    { name: 'user', type: 'relationship', relationTo: 'users' },
    { name: 'userName', type: 'text' },
    { name: 'archiveFile', type: 'text', admin: { description: 'Copy of the imported workbook in DATA_DIR/imports.' } },
  ],
  timestamps: true,
}
