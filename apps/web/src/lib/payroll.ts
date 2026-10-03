import type { ModuleField } from '@hr/shared/modules'

export const PERIOD_FIELDS: ModuleField[] = [
  { name: 'name', label: 'Period name', kind: 'text', required: true, help: 'e.g. "October 2026 — 1st half"' },
  { name: 'code', label: 'Code', kind: 'text', required: true, help: 'Short and unique, e.g. 2026-10-A' },
  { name: 'periodStart', label: 'Period start', kind: 'date', required: true },
  { name: 'periodEnd', label: 'Period end', kind: 'date', required: true },
  { name: 'payDate', label: 'Pay date', kind: 'date', required: true },
  { name: 'notes', label: 'Notes', kind: 'textarea' },
]
