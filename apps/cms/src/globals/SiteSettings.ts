import { DEFAULT_PALETTE, HEX_RE, PALETTE_KEYS, options } from '@hr/shared'
import { APIError, type Field, type GlobalConfig } from 'payload'

import { anyone, isStaff } from '../access'
import { writeAudit, diffDocs } from '../hooks/audit'

const colorField = (key: (typeof PALETTE_KEYS)[number]): Field => ({
  name: key,
  type: 'text',
  required: true,
  defaultValue: DEFAULT_PALETTE[key],
  validate: (value: unknown) => (typeof value === 'string' && HEX_RE.test(value)) || 'Use a hex color like #1d4ed8',
  admin: { width: '33%', description: 'Hex color, e.g. #1d4ed8' },
})

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Branding & Theme',
  admin: { group: 'Settings' },
  // Read is public: the login page needs the company name, logo and colors.
  access: { read: anyone, update: isStaff },
  fields: [
    { name: 'companyName', type: 'text', required: true, defaultValue: 'HR Management System', maxLength: 120 },
    { name: 'tagline', type: 'text', maxLength: 160 },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'PNG, SVG or JPG. Marked public automatically so it shows on the login page.' },
    },
    {
      name: 'palette',
      type: 'group',
      fields: [
        { type: 'row', fields: [colorField('primary'), colorField('secondary'), colorField('accent')] },
        { type: 'row', fields: [colorField('success'), colorField('warning'), colorField('danger')] },
      ],
    },
    {
      name: 'defaultTheme',
      type: 'select',
      required: true,
      defaultValue: 'system',
      options: options.themeModes,
      admin: { description: 'Used until a user picks light or dark mode themselves.' },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        const logoId = typeof data.logo === 'object' && data.logo ? data.logo.id : data.logo
        if (logoId) {
          // Only images can become the (public) logo — never a scanned document.
          const media = await req.payload.findByID({ collection: 'media', id: logoId, depth: 0, overrideAccess: true, req })
          if (!/^image\/(png|jpeg|webp|gif)$/.test(media.mimeType ?? '')) {
            throw new APIError('The logo must be a PNG, JPG, WEBP or GIF image.', 400, undefined, true)
          }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // The logo must be readable on the (public) login page.
        const logoId = typeof doc.logo === 'object' && doc.logo ? doc.logo.id : doc.logo
        if (logoId) {
          await req.payload.update({
            collection: 'media',
            id: logoId,
            data: { isPublic: true },
            overrideAccess: true,
            req,
          })
        }
        const changes = diffDocs(previousDoc, doc)
        if (Object.keys(changes).length) {
          await writeAudit(req, { action: 'update', collectionSlug: 'site-settings', docLabel: 'Branding & Theme', changes })
        }
        return doc
      },
    ],
  },
}
