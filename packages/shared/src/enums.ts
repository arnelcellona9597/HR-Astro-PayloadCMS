// Single source of truth for every fixed list used by Payload fields, the UI and Excel import/export.
// Changing a value here changes what is stored in the database — add new values, don't rename old ones.

export type Option<T extends string = string> = { label: string; value: T }

const opts = <T extends string>(values: readonly T[]): Option<T>[] =>
  values.map((value) => ({ label: value, value }))

export const ROLES = ['system-admin', 'hr-staff'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABELS: Record<Role, string> = {
  'system-admin': 'System Admin',
  'hr-staff': 'HR Staff',
}

export const USER_STATUSES = ['pending', 'approved', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const GENDERS = ['Male', 'Female'] as const
export type Gender = (typeof GENDERS)[number]

export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled', 'Solo Parent'] as const

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export const CLASSIFICATIONS = ['COS', 'Contractual', 'Regular'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

export const EMPLOYMENT_STATUSES = ['Active', 'Resigned', 'Retired', 'Terminated'] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

export const EDUCATIONAL_ATTAINMENTS = [
  'Elementary Undergraduate',
  'Elementary Graduate',
  'High School Undergraduate',
  'High School Graduate',
  'Senior High School Graduate',
  'Vocational / Technical',
  'College Undergraduate',
  'College Graduate',
  "Master's Units",
  "Master's Degree",
  'Doctoral Units',
  'Doctoral Degree',
] as const

export const REGIONS = [
  'NCR',
  'CAR',
  'Region I',
  'Region II',
  'Region III',
  'Region IV-A',
  'MIMAROPA',
  'Region V',
  'Region VI',
  'NIR',
  'Region VII',
  'Region VIII',
  'Region IX',
  'Region X',
  'Region XI',
  'Region XII',
  'Region XIII',
  'BARMM',
] as const

export const APPLICATION_STATUSES = [
  'Pending',
  'For Interview',
  'For OJT',
  'Hired',
  'Not Hired',
  'Withdrawn',
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const REQUIREMENT_STATUSES = ['Pending', 'Submitted', 'Verified', 'N/A'] as const
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]

/** Onboarding documents, in the column order HR uses. `key` is the database field name. */
export const ONBOARDING_REQUIREMENTS = [
  { key: 'reqPds', label: 'PDS' },
  { key: 'reqSpecimenSign', label: 'Specimen Sign' },
  { key: 'reqSwornDeclaration', label: 'Sworn Declaration' },
  { key: 'reqTinVerification', label: 'TIN Verification' },
  { key: 'reqPoliceClearance', label: 'Police Clearance' },
  { key: 'reqMedicalLab', label: 'Medical Lab' },
  { key: 'reqLandbankAccount', label: 'Landbank Account' },
  { key: 'reqAssumptionOfDuty', label: 'Assumption of Duty' },
  { key: 'reqDriverLicense', label: 'Driver License' },
  { key: 'reqOrCr', label: 'OR/CR' },
] as const
export type OnboardingRequirementKey = (typeof ONBOARDING_REQUIREMENTS)[number]['key']

export const SUBMISSION_STATUSES = ['Submitted', 'Pending'] as const

export const IPCR_PERIODS = ['Jan-Jun', 'Jul-Dec'] as const
export type IpcrPeriod = (typeof IPCR_PERIODS)[number]

export const THEME_MODES = ['light', 'dark', 'system'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const options = {
  roles: ROLES.map((value) => ({ label: ROLE_LABELS[value], value })),
  userStatuses: opts(USER_STATUSES),
  genders: opts(GENDERS),
  civilStatuses: opts(CIVIL_STATUSES),
  bloodTypes: opts(BLOOD_TYPES),
  classifications: opts(CLASSIFICATIONS),
  employmentStatuses: opts(EMPLOYMENT_STATUSES),
  educationalAttainments: opts(EDUCATIONAL_ATTAINMENTS),
  regions: opts(REGIONS),
  applicationStatuses: opts(APPLICATION_STATUSES),
  requirementStatuses: opts(REQUIREMENT_STATUSES),
  submissionStatuses: opts(SUBMISSION_STATUSES),
  ipcrPeriods: opts(IPCR_PERIODS),
  themeModes: opts(THEME_MODES),
}
