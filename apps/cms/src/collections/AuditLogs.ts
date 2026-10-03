import type { CollectionConfig } from 'payload'

import { isHrAdmin, nobody } from '../access'

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Audit Log', plural: 'Audit Logs' },
  admin: {
    group: 'Administration',
    useAsTitle: 'docLabel',
    defaultColumns: ['createdAt', 'userName', 'action', 'collectionSlug', 'docLabel'],
  },
  // Written only by hooks (overrideAccess); nobody can edit or delete history.
  access: { read: isHrAdmin, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', index: true },
    { name: 'userName', type: 'text' },
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'collectionSlug', label: 'Collection', type: 'text', required: true, index: true },
    { name: 'docId', type: 'text', index: true },
    { name: 'docLabel', type: 'text' },
    { name: 'changes', type: 'json' },
  ],
  timestamps: true,
}
