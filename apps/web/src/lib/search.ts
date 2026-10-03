import {
  addYears,
  addDays,
  BLOOD_TYPES,
  CIVIL_STATUSES,
  CLASSIFICATIONS,
  EDUCATIONAL_ATTAINMENTS,
  EMPLOYMENT_STATUSES,
  GENDERS,
  isValidYmd,
  REGIONS,
  todayYmd,
} from '@hr/shared'
import type { Where } from 'payload'

// Advanced employee search: URL params → Payload `where`. The same function powers the list page and
// "Export these results", so the export always matches what's on screen.

const multi = (p: URLSearchParams, key: string, allowed: readonly string[]) =>
  p.getAll(key).filter((v) => allowed.includes(v))

const intParam = (p: URLSearchParams, key: string) => {
  const v = p.get(key)
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

const dateParam = (p: URLSearchParams, key: string) => {
  const v = p.get(key) ?? ''
  return isValidYmd(v) ? v : null
}

export const EMPLOYEE_SORTS = ['fullName', 'employeeId', 'position', 'classification', 'employmentStatus', 'dateHired', 'dateOfBirth', 'updatedAt'] as const

export type EmployeeQuery = {
  q: string
  status: string[]
  classification: string[]
  branch: number[]
  gender: string[]
  region: string[]
  civilStatus: string[]
  bloodType: string[]
  education: string[]
  position: string
  hiredFrom: string | null
  hiredTo: string | null
  ageMin: number | null
  ageMax: number | null
  losMin: number | null
  losMax: number | null
  sort: string
  page: number
  limit: number
}

export function parseEmployeeQuery(p: URLSearchParams): EmployeeQuery {
  const sortRaw = p.get('sort') ?? 'fullName'
  const sortField = sortRaw.replace(/^-/, '')
  return {
    q: (p.get('q') ?? '').trim().slice(0, 100),
    status: multi(p, 'status', EMPLOYMENT_STATUSES),
    classification: multi(p, 'classification', CLASSIFICATIONS),
    branch: p
      .getAll('branch')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    gender: multi(p, 'gender', GENDERS),
    region: multi(p, 'region', REGIONS),
    civilStatus: multi(p, 'civilStatus', CIVIL_STATUSES),
    bloodType: multi(p, 'bloodType', BLOOD_TYPES),
    education: multi(p, 'education', EDUCATIONAL_ATTAINMENTS),
    position: (p.get('position') ?? '').trim().slice(0, 100),
    hiredFrom: dateParam(p, 'hiredFrom'),
    hiredTo: dateParam(p, 'hiredTo'),
    ageMin: intParam(p, 'ageMin'),
    ageMax: intParam(p, 'ageMax'),
    losMin: intParam(p, 'losMin'),
    losMax: intParam(p, 'losMax'),
    sort: (EMPLOYEE_SORTS as readonly string[]).includes(sortField) ? sortRaw : 'fullName',
    page: Math.max(1, intParam(p, 'page') ?? 1),
    limit: [25, 50, 100].includes(intParam(p, 'limit') ?? 0) ? intParam(p, 'limit')! : 25,
  }
}

const TEXT_FIELDS = ['fullName', 'employeeId', 'email', 'position', 'contactNumber', 'sss', 'tin', 'pagibig', 'philhealth']

export function employeeWhere(q: EmployeeQuery, today = todayYmd()): Where {
  const and: Where[] = []
  // Every word must match somewhere (name, ID, email, position, phone or a government ID number).
  for (const word of q.q.split(/\s+/).filter(Boolean).slice(0, 6)) {
    and.push({ or: TEXT_FIELDS.map((f) => ({ [f]: { like: word } })) })
  }
  if (q.status.length) and.push({ employmentStatus: { in: q.status } })
  if (q.classification.length) and.push({ classification: { in: q.classification } })
  if (q.branch.length) and.push({ station: { in: q.branch } })
  if (q.gender.length) and.push({ gender: { in: q.gender } })
  if (q.region.length) and.push({ region: { in: q.region } })
  if (q.civilStatus.length) and.push({ civilStatus: { in: q.civilStatus } })
  if (q.bloodType.length) and.push({ bloodType: { in: q.bloodType } })
  if (q.education.length) and.push({ educationalAttainment: { in: q.education } })
  if (q.position) and.push({ position: { like: q.position } })
  if (q.hiredFrom) and.push({ dateHired: { greater_than_equal: `${q.hiredFrom}T00:00:00.000Z` } })
  if (q.hiredTo) and.push({ dateHired: { less_than_equal: `${q.hiredTo}T23:59:59.999Z` } })
  // Age N means born on or before (today − N years) and after (today − (N+1) years).
  if (q.ageMin !== null) and.push({ dateOfBirth: { less_than_equal: `${addYears(today, -q.ageMin)}T23:59:59.999Z` } })
  if (q.ageMax !== null) and.push({ dateOfBirth: { greater_than: `${addYears(today, -(q.ageMax + 1))}T23:59:59.999Z` } })
  // Length of service in whole years, measured from the hire date to today.
  if (q.losMin !== null) and.push({ dateHired: { less_than_equal: `${addYears(today, -q.losMin)}T23:59:59.999Z` } })
  if (q.losMax !== null) and.push({ dateHired: { greater_than: `${addDays(addYears(today, -(q.losMax + 1)), 0)}T23:59:59.999Z` } })
  return and.length ? { and } : {}
}

/** Number of active filters other than the free-text box, for the "Filters (n)" badge. */
export function activeFilterCount(q: EmployeeQuery): number {
  return (
    q.status.length +
    q.classification.length +
    q.branch.length +
    q.gender.length +
    q.region.length +
    q.civilStatus.length +
    q.bloodType.length +
    q.education.length +
    (q.position ? 1 : 0) +
    (q.hiredFrom ? 1 : 0) +
    (q.hiredTo ? 1 : 0) +
    (q.ageMin !== null ? 1 : 0) +
    (q.ageMax !== null ? 1 : 0) +
    (q.losMin !== null ? 1 : 0) +
    (q.losMax !== null ? 1 : 0)
  )
}
