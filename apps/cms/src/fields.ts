import { formatGovId, normalizeDateOnly, validateEmail, validateGovId, validatePhone, type IdKind } from '@hr/shared'
import type { DateField, Field, TextField } from 'payload'

/** Collapses runs of whitespace and trims; empty strings become null so "blank" is stored one way. */
export function cleanText(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const v = value.replace(/\s+/g, ' ').trim()
  return v === '' ? null : v
}

type TextOpts = Partial<Omit<TextField, 'type' | 'name' | 'hasMany'>>

export const text = (name: string, label: string, extra: TextOpts = {}): TextField =>
  ({
    name,
    label,
    type: 'text',
    ...extra,
    hooks: { ...extra.hooks, beforeValidate: [({ value }) => cleanText(value)] },
  }) as TextField

/**
 * A date with no time of day (birthday, hire date…). Stored as YYYY-MM-DDT12:00:00Z so it never
 * shifts a day between Manila and UTC. Unparseable input is left untouched so validation rejects it
 * instead of silently blanking it.
 */
export const dateOnly = (name: string, label: string, extra: Partial<Omit<DateField, 'type' | 'name'>> = {}): DateField => ({
  name,
  label,
  type: 'date',
  ...extra,
  admin: {
    date: { pickerAppearance: 'dayOnly', displayFormat: 'MMM d, yyyy' },
    ...extra.admin,
  },
  hooks: {
    ...extra.hooks,
    beforeValidate: [
      ({ value }) => {
        if (value === '' || value === undefined || value === null) return null
        return normalizeDateOnly(value) ?? value
      },
    ],
  },
})

export const govId = (name: string, kind: IdKind, label: string): TextField => ({
  name,
  label,
  type: 'text',
  index: true,
  validate: (value: unknown) => validateGovId(kind, value) ?? true,
  hooks: {
    beforeValidate: [({ value }) => cleanText(value)],
    beforeChange: [({ value }) => formatGovId(kind, value)],
  },
})

export const email = (name: string, label: string, extra: TextOpts = {}): TextField =>
  text(name, label, {
    ...extra,
    validate: (value: unknown) => validateEmail(value) ?? true,
  })

export const phone = (name: string, label: string, extra: TextOpts = {}): TextField =>
  text(name, label, {
    ...extra,
    validate: (value: unknown) => validatePhone(value) ?? true,
  })

/** Last / first / middle name copied from the linked employee (kept for exports and history). */
export const nameSnapshotFields = (withExtension = true): Field[] => [
  {
    type: 'row',
    fields: [
      text('lastName', 'Last Name', { admin: { readOnly: true } }),
      text('firstName', 'First Name', { admin: { readOnly: true } }),
      text('middleName', 'Middle Name', { admin: { readOnly: true } }),
      ...(withExtension ? [text('extension', 'Ext.', { admin: { readOnly: true, width: '80px' } })] : []),
    ],
  },
]
