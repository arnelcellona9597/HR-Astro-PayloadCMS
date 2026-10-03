// One definition per module of every field shown in forms and every Excel column.
// The Excel header is the field `label`, so exports, import templates and imports always agree.
import {
  APPLICATION_STATUSES,
  BLOOD_TYPES,
  CIVIL_STATUSES,
  CLASSIFICATIONS,
  EDUCATIONAL_ATTAINMENTS,
  EMPLOYMENT_STATUSES,
  GENDERS,
  IPCR_PERIODS,
  ONBOARDING_REQUIREMENTS,
  REGIONS,
  REQUIREMENT_STATUSES,
} from './enums'
import type { IdKind } from './ids'

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'govId'
  | 'select'
  | 'date'
  | 'number'
  | 'year'
  /** relationship to employees, written in Excel as the Employee ID */
  | 'employee'
  /** relationship to branches, written in Excel as the branch name (or code on import) */
  | 'branch'

export type ModuleField = {
  name: string
  /** Form label and exact Excel column header. */
  label: string
  kind: FieldKind
  required?: boolean
  options?: readonly string[]
  idKind?: IdKind
  /** Computed by the system: exported, shown, but never imported or edited. */
  computed?: boolean
  /** Filled automatically from the linked employee when left blank. */
  fromEmployee?: boolean
  /** Not editable in forms (still imported if present). */
  section?: string
  help?: string
  min?: number
  max?: number
  step?: number
  /** Form-only fields that are not part of the Excel sheet. */
  formOnly?: boolean
  /** Excel column width in characters. */
  width?: number
}

export type ModuleDef = {
  slug: string
  /** Name used in URLs, menus and the Excel sheet name (max 31 chars). */
  sheet: string
  title: string
  /** Fields that identify an existing record when importing (upsert key). */
  key: string[]
  fields: ModuleField[]
}

const sel = (name: string, label: string, options: readonly string[], extra: Partial<ModuleField> = {}): ModuleField => ({
  name,
  label,
  kind: 'select',
  options,
  ...extra,
})

const nameSnapshot = (withExt: boolean): ModuleField[] => [
  { name: 'lastName', label: 'Last Name', kind: 'text', fromEmployee: true },
  { name: 'firstName', label: 'First Name', kind: 'text', fromEmployee: true },
  { name: 'middleName', label: 'Middle Name', kind: 'text', fromEmployee: true },
  ...(withExt ? [{ name: 'extension', label: 'Ext.', kind: 'text', fromEmployee: true } as ModuleField] : []),
]

export const EMPLOYEES: ModuleDef = {
  slug: 'employees',
  sheet: 'Employees',
  title: 'Employees',
  key: ['employeeId'],
  fields: [
    { name: 'lastName', label: 'Last Name', kind: 'text', required: true, section: 'Personal' },
    { name: 'firstName', label: 'First Name', kind: 'text', required: true, section: 'Personal' },
    { name: 'middleName', label: 'Middle Name', kind: 'text', section: 'Personal' },
    { name: 'extension', label: 'Extn.', kind: 'text', section: 'Personal', width: 8 },
    sel('gender', 'Gender', GENDERS, { required: true, section: 'Personal' }),
    { name: 'dateOfBirth', label: 'Date of Birth', kind: 'date', section: 'Personal' },
    { name: 'age', label: 'Age', kind: 'number', computed: true, section: 'Personal', width: 6 },
    sel('civilStatus', 'Civil Status', CIVIL_STATUSES, { section: 'Personal' }),
    { name: 'religion', label: 'Religion', kind: 'text', section: 'Personal' },
    sel('bloodType', 'Blood Type', BLOOD_TYPES, { section: 'Personal', width: 8 }),
    { name: 'professionalEligibility', label: 'Professional Eligibility / License', kind: 'text', section: 'Personal', width: 28 },
    { name: 'contactNumber', label: 'Contact Number', kind: 'phone', section: 'Personal' },
    { name: 'address', label: 'Address', kind: 'text', section: 'Personal', width: 36 },
    { name: 'email', label: 'Email Address', kind: 'email', section: 'Personal', width: 28 },
    sel('educationalAttainment', 'Educational Attainment', EDUCATIONAL_ATTAINMENTS, { section: 'Education', width: 24 }),
    { name: 'courses', label: 'Courses', kind: 'text', section: 'Education', width: 28 },
    { name: 'yearLevelEarnedUnits', label: 'Year Level / Earned Units', kind: 'text', section: 'Education' },
    { name: 'academicHonors', label: 'Academic Honors Received', kind: 'text', section: 'Education', width: 24 },
    { name: 'employeeId', label: 'Employee ID', kind: 'text', required: true, section: 'Employment' },
    { name: 'station', label: 'Station / Division / Unit', kind: 'branch', section: 'Employment', width: 26 },
    sel('region', 'Region', REGIONS, { section: 'Employment' }),
    { name: 'position', label: 'Position / Designation', kind: 'text', section: 'Employment', width: 26 },
    { name: 'natureOfWork', label: 'Nature of Work', kind: 'text', section: 'Employment' },
    { name: 'driverLicenseNumber', label: 'Driver License Number', kind: 'text', section: 'Employment' },
    { name: 'dateHired', label: 'Date Hired', kind: 'date', section: 'Employment' },
    { name: 'lastDayOfService', label: 'Last Day of Service', kind: 'date', section: 'Employment' },
    { name: 'lengthOfService', label: 'Length in Service', kind: 'text', computed: true, section: 'Employment' },
    sel('classification', 'Classification', CLASSIFICATIONS, {
      required: true,
      section: 'Employment',
      help: 'COS, Contractual or Regular',
    }),
    sel('employmentStatus', 'Employment Status', EMPLOYMENT_STATUSES, { required: true, section: 'Employment' }),
    { name: 'sss', label: 'SSS Number', kind: 'govId', idKind: 'sss', section: 'Government IDs' },
    { name: 'pagibig', label: 'Pag-IBIG Number', kind: 'govId', idKind: 'pagibig', section: 'Government IDs' },
    { name: 'tin', label: 'TIN Number', kind: 'govId', idKind: 'tin', section: 'Government IDs' },
    { name: 'philhealth', label: 'PhilHealth Number', kind: 'govId', idKind: 'philhealth', section: 'Government IDs' },
    { name: 'emergencyContactName', label: 'Emergency Contact Person', kind: 'text', section: 'Emergency Contact', width: 24 },
    { name: 'emergencyRelationship', label: 'Relationship', kind: 'text', section: 'Emergency Contact' },
    { name: 'emergencyContactNumber', label: 'Emergency Contact Number', kind: 'phone', section: 'Emergency Contact' },
    { name: 'emergencyAddress', label: 'Emergency Contact Address', kind: 'text', section: 'Emergency Contact', width: 36 },
    { name: 'remarks', label: 'Remark', kind: 'textarea', section: 'Employment', width: 30 },
  ],
}

export const BRANCHES: ModuleDef = {
  slug: 'branches',
  sheet: 'Branches',
  title: 'Branches',
  key: ['name'],
  fields: [
    { name: 'name', label: 'Branch Name', kind: 'text', required: true, width: 30 },
    { name: 'code', label: 'Code', kind: 'text' },
    { name: 'address', label: 'Address', kind: 'text', width: 40 },
    sel('region', 'Region', REGIONS),
    { name: 'contactNumber', label: 'Contact Number', kind: 'phone' },
    { name: 'notes', label: 'Notes', kind: 'textarea', width: 30 },
  ],
}

export const APPLICATIONS: ModuleDef = {
  slug: 'applications',
  sheet: 'Onboarding',
  title: 'Onboarding Tracker',
  key: ['applicationId'],
  fields: [
    { name: 'applicationId', label: 'Application ID', kind: 'text', required: true },
    { name: 'applicantName', label: 'Applicant Name', kind: 'text', required: true, width: 26 },
    { name: 'positionApplied', label: 'Position Applied', kind: 'text', required: true, width: 24 },
    { name: 'station', label: 'Station', kind: 'branch', width: 24 },
    { name: 'replacement', label: 'Replacement', kind: 'text', width: 22 },
    { name: 'dateApplied', label: 'Date Applied', kind: 'date', required: true },
    { name: 'startOjt', label: 'Start OJT', kind: 'date' },
    sel('applicationStatus', 'Application Status', APPLICATION_STATUSES, { required: true }),
    ...ONBOARDING_REQUIREMENTS.map((r) => sel(r.key, r.label, REQUIREMENT_STATUSES, { section: 'Requirements', width: 12 })),
    { name: 'dateSubmitted', label: 'Date Submitted', kind: 'date' },
    { name: 'requirementsStatus', label: 'FDS Requirements Status', kind: 'text', computed: true },
    { name: 'remarks', label: 'Remarks', kind: 'textarea', width: 30 },
  ],
}

export const LEAVE_STATUS_OPTIONS = ['Approved', 'Pending', 'Disapproved', 'Cancelled'] as const

export const WELLNESS_LEAVES: ModuleDef = {
  slug: 'wellness-leaves',
  sheet: 'Wellness Leave',
  title: 'Wellness Leave',
  key: ['employee', 'inclusiveDateFrom'],
  fields: [
    { name: 'employee', label: 'Employee ID', kind: 'employee', required: true },
    { name: 'lastName', label: 'Last Name', kind: 'text', computed: true },
    { name: 'firstName', label: 'First Name', kind: 'text', computed: true },
    { name: 'middleName', label: 'Middle Name', kind: 'text', computed: true },
    { name: 'dateFiling', label: 'Date Filing', kind: 'date', required: true },
    { name: 'inclusiveDateFrom', label: 'Inclusive Date From', kind: 'date', required: true },
    { name: 'inclusiveDateTo', label: 'Inclusive Date To', kind: 'date', required: true },
    { name: 'dateReceived', label: 'Date Received', kind: 'date' },
    { name: 'days', label: 'Days', kind: 'number', computed: true, width: 6 },
    { name: 'remainingDays', label: 'Remaining Days', kind: 'number', computed: true, width: 8 },
    sel('status', 'Status', LEAVE_STATUS_OPTIONS, { required: true }),
    { name: 'remarks', label: 'Remarks', kind: 'textarea', width: 30 },
  ],
}

export const HOLIDAYS: ModuleDef = {
  slug: 'holidays',
  sheet: 'Holidays',
  title: 'Holidays',
  key: ['date'],
  fields: [
    { name: 'date', label: 'Date', kind: 'date', required: true },
    { name: 'name', label: 'Name', kind: 'text', required: true, width: 30 },
    sel('type', 'Type', ['Regular Holiday', 'Special Non-Working Day', 'Local Holiday', 'Office Closure'], { width: 24 }),
  ],
}

const complianceBase: ModuleField[] = [
  { name: 'employee', label: 'Employee ID', kind: 'employee', required: true },
  { name: 'year', label: 'Year', kind: 'year', required: true, width: 8 },
]

export const ITR: ModuleDef = {
  slug: 'itr-submissions',
  sheet: 'Income Tax Return',
  title: 'Annual Income Tax Return',
  key: ['employee', 'year'],
  fields: [
    ...complianceBase,
    ...nameSnapshot(true),
    { name: 'dateSubmitted', label: 'Date Submitted', kind: 'date' },
    { name: 'dateReceived', label: 'Date Received', kind: 'date' },
    { name: 'remarks', label: 'Remark', kind: 'textarea', width: 30 },
  ],
}

export const SWORN_DECLARATIONS: ModuleDef = {
  slug: 'sworn-declarations',
  sheet: 'Sworn Declaration',
  title: 'Sworn Declaration',
  key: ['employee', 'year'],
  fields: [
    ...complianceBase,
    ...nameSnapshot(false),
    { name: 'station', label: 'Station / Division / Unit', kind: 'text', fromEmployee: true, width: 26 },
    { name: 'jobTitle', label: 'Job Title', kind: 'text', fromEmployee: true, width: 24 },
    { name: 'tin', label: 'TIN Number', kind: 'text', fromEmployee: true },
    { name: 'dateSubmitted', label: 'Date Submitted', kind: 'date' },
    { name: 'dateReceived', label: 'Date Received', kind: 'date' },
    { name: 'remarks', label: 'Remarks', kind: 'textarea', width: 30 },
  ],
}

export const PDS: ModuleDef = {
  slug: 'pds-submissions',
  sheet: 'Personal Data Sheet',
  title: 'Personal Data Sheet',
  key: ['employee', 'year'],
  fields: [
    ...complianceBase,
    ...nameSnapshot(false),
    { name: 'station', label: 'Station / Division / Unit', kind: 'text', fromEmployee: true, width: 26 },
    { name: 'jobTitle', label: 'Job Title', kind: 'text', fromEmployee: true, width: 24 },
    { name: 'dateSubmitted', label: 'Date Submitted', kind: 'date' },
    { name: 'dateReceived', label: 'Date Received', kind: 'date' },
    { name: 'remarks', label: 'Remarks', kind: 'textarea', width: 30 },
  ],
}

export const IPCR: ModuleDef = {
  slug: 'ipcr-ratings',
  sheet: 'IPCR',
  title: 'Individual Performance Commitment and Review (IPCR)',
  key: ['employee', 'year', 'ratingPeriod'],
  fields: [
    ...complianceBase,
    ...nameSnapshot(false),
    { name: 'jobTitle', label: 'Job Title', kind: 'text', fromEmployee: true, width: 24 },
    { name: 'station', label: 'Station / Division / Unit', kind: 'text', fromEmployee: true, width: 26 },
    sel('ratingPeriod', 'Rating Period', IPCR_PERIODS, { required: true }),
    { name: 'periodFrom', label: 'Period From', kind: 'date' },
    { name: 'periodTo', label: 'Period To', kind: 'date' },
    { name: 'rating', label: 'Rating', kind: 'number', min: 1, max: 5, step: 0.001, width: 8 },
    { name: 'adjectivalRating', label: 'Adjectival Rating', kind: 'text', computed: true, width: 18 },
    { name: 'dateSubmitted', label: 'Date Submitted', kind: 'date' },
    { name: 'dateReceived', label: 'Date Received', kind: 'date' },
    { name: 'remarks', label: 'Remarks', kind: 'textarea', width: 30 },
  ],
}

export const COMPLIANCE_MODULES = [ITR, SWORN_DECLARATIONS, PDS, IPCR] as const

/** Import order matters: branches before employees, employees before everything that links to them. */
export const ALL_MODULES: ModuleDef[] = [BRANCHES, HOLIDAYS, EMPLOYEES, APPLICATIONS, WELLNESS_LEAVES, ...COMPLIANCE_MODULES]

export function moduleBySlug(slug: string): ModuleDef | undefined {
  return ALL_MODULES.find((m) => m.slug === slug)
}

/** URL segment for each annual requirement (e.g. /requirements/itr). */
export const COMPLIANCE_ROUTES: Record<string, ModuleDef> = {
  itr: ITR,
  'sworn-declaration': SWORN_DECLARATIONS,
  pds: PDS,
  ipcr: IPCR,
}
