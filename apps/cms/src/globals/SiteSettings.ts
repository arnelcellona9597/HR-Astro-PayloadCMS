import { DEFAULT_PALETTE, HEX_RE, PALETTE_KEYS, options } from '@hr/shared'
import type { Field, GlobalConfig } from 'payload'

import { anyone, isSuperAdmin } from '../access'
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
  access: { read: anyone, update: isSuperAdmin },
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
