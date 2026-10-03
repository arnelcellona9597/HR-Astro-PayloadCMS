import type { CollectionConfig } from 'payload'

import { nobody } from '../access'

/** Pending email-code checks for sign-in and registration. Only the 2FA service touches these. */
export const LoginChallenges: CollectionConfig = {
  slug: 'login-challenges',
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'purpose', type: 'select', required: true, options: ['login', 'register'].map((v) => ({ label: v, value: v })) },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true },
    // The Payload session token, encrypted, released only after the code is verified.
    { name: 'tokenEnc', type: 'text' },
    { name: 'tokenExp', type: 'number' },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'sendCount', type: 'number', defaultValue: 1 },
    { name: 'lastSentAt', type: 'date' },
    { name: 'ip', type: 'text' },
  ],
  timestamps: true,
}
