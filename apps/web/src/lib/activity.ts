// Turns audit-log entries into short sentences for the dashboard's activity timeline.
import { COMPLIANCE_ROUTES } from '@hr/shared/modules'

type Area = { label: string; link?: (id: string) => string }

/** Short names for the annual requirements (the full titles are long for cards and sentences). */
export const REQUIREMENT_SHORT: Record<string, string> = {
  'itr-submissions': 'ITR',
  'sworn-declarations': 'Sworn Declaration',
  'pds-submissions': 'PDS',
  'ipcr-ratings': 'IPCR',
}

const complianceAreas: Record<string, Area> = Object.fromEntries(
  Object.entries(COMPLIANCE_ROUTES).map(([route, mod]) => [
    mod.slug,
    { label: `${REQUIREMENT_SHORT[mod.slug] ?? mod.title} record`, link: (id: string) => `/requirements/${route}/${id}` },
  ]),
)

const AREAS: Record<string, Area> = {
  employees: { label: 'employee', link: (id) => `/employees/${id}` },
  branches: { label: 'branch', link: (id) => `/branches/${id}` },
  applications: { label: 'applicant', link: (id) => `/onboarding/${id}` },
  'wellness-leaves': { label: 'wellness leave', link: (id) => `/leave/${id}` },
  'payroll-periods': { label: 'payroll period', link: (id) => `/payroll/${id}` },
  payslips: { label: 'payslip', link: (id) => `/payroll/payslips/${id}` },
  'email-templates': { label: 'email template', link: (id) => `/settings/templates/${id}` },
  certificates: { label: 'certificate', link: (id) => `/certificates/${id}` },
  'certificate-templates': { label: 'certificate template', link: (id) => `/certificates/templates/${id}` },
  holidays: { label: 'holiday', link: () => '/leave/settings' },
  users: { label: 'HR account', link: () => '/users' },
  'site-settings': { label: 'branding settings', link: () => '/settings' },
  'leave-settings': { label: 'leave settings', link: () => '/leave/settings' },
  'notification-settings': { label: 'email settings', link: () => '/settings/notifications' },
  'smtp-settings': { label: 'email server settings', link: () => '/settings/email-server' },
  'payslip-settings': { label: 'payslip template', link: () => '/payroll/settings' },
  ...complianceAreas,
}

const VERBS: Record<string, string> = { create: 'added', update: 'updated', delete: 'deleted', import: 'imported' }

export type ActivityEntry = {
  id: number | string
  who: string
  verb: string
  what: string
  record: string | null
  href: string | null
  action: 'create' | 'update' | 'delete' | 'import' | 'other'
  at: string
}

export function describeActivity(log: {
  id: number | string
  userName?: string | null
  action?: string | null
  collectionSlug?: string | null
  docId?: string | null
  docLabel?: string | null
  createdAt: string
}): ActivityEntry {
  const area = AREAS[log.collectionSlug ?? ''] ?? { label: (log.collectionSlug ?? 'record').replace(/-/g, ' ') }
  const action = (['create', 'update', 'delete', 'import'] as const).find((a) => a === log.action) ?? 'other'
  return {
    id: log.id,
    who: log.userName || 'System',
    verb: VERBS[log.action ?? ''] ?? log.action ?? 'changed',
    what: area.label,
    record: log.docLabel || null,
    // Deleted records no longer have a page to open.
    href: action !== 'delete' && area.link && log.docId ? area.link(log.docId) : null,
    action,
    at: log.createdAt,
  }
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** "5 minutes ago", "yesterday", "just now". */
export function timeAgo(iso: string, now = Date.now()): string {
  const secs = Math.round((Date.parse(iso) - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return RTF.format(Math.round(secs / size), unit)
  }
  return 'just now'
}
