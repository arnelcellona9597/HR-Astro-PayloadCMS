import type { CollectionConfig, Where } from 'payload'

import { isApproved, isStaff } from '../access'
import { MEDIA_DIR } from '../env'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Profile photos and scanned documents are personal data (Data Privacy Act, RA 10173):
// only signed-in HR staff can read them. The only exception is files marked public, such as the
// company logo shown on the login page.
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'File', plural: 'Files' },
  admin: { group: 'Administration', defaultColumns: ['filename', 'alt', 'isPublic', 'updatedAt'] },
  access: {
    read: ({ req }) => (isApproved(req.user) ? true : ({ isPublic: { equals: true } } as Where)),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  upload: {
    staticDir: MEDIA_DIR,
    // No SVG: an SVG can carry scripts, and Payload serves files from this same origin.
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'],
    // No resizing: `sharp` is not used on the shared host.
    crop: false,
    focalPoint: false,
  },
  fields: [
    { name: 'alt', label: 'Description', type: 'text' },
    {
      name: 'isPublic',
      label: 'Public (visible without login)',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        const file = (req as { file?: { size?: number } }).file
        if ((operation === 'create' || operation === 'update') && file?.size && file.size > MAX_UPLOAD_BYTES) {
          throw new Error(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
        }
        return args
      },
    ],
  },
}
