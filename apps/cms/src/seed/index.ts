// Sample data for development and demos: `pnpm seed` (refuses to run in production or on a non-empty database).
// Uses a fixed random seed so every run produces the same data.
import {
  BLOOD_TYPES,
  CIVIL_STATUSES,
  EDUCATIONAL_ATTAINMENTS,
  ONBOARDING_REQUIREMENTS,
  REGIONS,
  addDays,
  countWorkdays,
  todayYmd,
} from '@hr/shared'
import { getPayload } from 'payload'

import config from '../payload.config'

let s = 20261004
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join('')
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Rivera', 'Flores', 'Dela Cruz', 'Gonzales', 'Navarro', 'Salazar', 'Pascual', 'Domingo', 'Mercado', 'Aguilar', 'Soriano', 'Lim', 'Tan']
const MALE = ['Juan', 'Jose', 'Mark', 'John Paul', 'Christian', 'Rafael', 'Miguel', 'Carlo', 'Paolo', 'Angelo', 'Ramon', 'Eduardo', 'Noel', 'Ronald', 'Jerome']
const FEMALE = ['Maria', 'Ana', 'Kristine', 'Jasmine', 'Angelica', 'Patricia', 'Camille', 'Rose', 'Joy', 'Grace', 'Michelle', 'Liza', 'Carmela', 'Bea', 'Andrea']
const POSITIONS = [
  ['Administrative Aide I', 10],
  ['Administrative Assistant II', 8],
  ['Administrative Officer IV', 4],
  ['Engineer II', 5],
  ['Forester I', 6],
  ['Driver I', 4],
  ['Security Guard I', 3],
  ['Accountant III', 2],
  ['Project Development Officer I', 6],
  ['Information Systems Analyst II', 2],
  ['Records Officer I', 2],
  ['Nurse II', 2],
  ['Laborer I', 5],
] as const
const weightedPosition = () => {
  const total = POSITIONS.reduce((a, [, w]) => a + w, 0)
  let r = rand() * total
  for (const [p, w] of POSITIONS) if ((r -= w) <= 0) return p
  return POSITIONS[0][0]
}

async function run() {
  if (process.env.NODE_ENV === 'production' && process.env.HR_SEED_FORCE !== '1') throw new Error('Refusing to seed in production.')
  const payload = await getPayload({ config })
  const existing = await payload.count({ collection: 'employees', overrideAccess: true })
  if (existing.totalDocs > 0) {
    payload.logger.info('Employees already exist — seed skipped.')
    process.exit(0)
  }
  const opts = { overrideAccess: true, context: { skipAudit: true } } as const
  const today = todayYmd()
  const thisYear = Number(today.slice(0, 4))

  // Holidays (regular holidays; HR should confirm each year's proclamation)
  for (const year of [thisYear - 1, thisYear]) {
    for (const [md, name] of [
      ['01-01', "New Year's Day"],
      ['04-09', 'Araw ng Kagitingan'],
      ['05-01', 'Labor Day'],
      ['06-12', 'Independence Day'],
      ['11-30', 'Bonifacio Day'],
      ['12-25', 'Christmas Day'],
      ['12-30', 'Rizal Day'],
    ] as const) {
      await payload.create({ collection: 'holidays', data: { date: `${year}-${md}`, name, type: 'Regular Holiday' }, ...opts })
    }
  }

  const branchData = [
    { name: 'Regional Office', code: 'RO', address: 'Diliman, Quezon City', region: 'NCR' },
    { name: 'PENRO Laguna', code: 'LAG', address: 'Los Baños, Laguna', region: 'Region IV-A' },
    { name: 'PENRO Batangas', code: 'BAT', address: 'Batangas City, Batangas', region: 'Region IV-A' },
    { name: 'CENRO Calaca', code: 'CAL', address: 'Calaca, Batangas', region: 'Region IV-A' },
    { name: 'Field Office Quezon', code: 'QZN', address: 'Lucena City, Quezon', region: 'Region IV-A' },
  ] as const
  const branches = []
  for (const b of branchData) branches.push(await payload.create({ collection: 'branches', data: { ...b, contactNumber: `(02) 8${digits(3)}-${digits(4)}` }, ...opts }))

  const employees = []
  for (let i = 1; i <= 140; i++) {
    const gender = rand() < 0.48 ? 'Female' : 'Male'
    const hiredYear = int(thisYear - 18, thisYear)
    const dateHired = ymd(hiredYear, int(1, 12), int(1, 28))
    const statusRoll = rand()
    const employmentStatus = statusRoll < 0.78 ? 'Active' : statusRoll < 0.88 ? 'Resigned' : statusRoll < 0.95 ? 'Retired' : 'Terminated'
    let lastDayOfService: string | null = null
    if (employmentStatus !== 'Active') {
      const end = addDays(dateHired, int(200, 4000))
      lastDayOfService = end < today ? end : addDays(today, -int(5, 300))
      if (lastDayOfService < dateHired) lastDayOfService = addDays(dateHired, 30)
    }
    const classRoll = rand()
    const branch = pick(branches)
    const emp = await payload.create({
      collection: 'employees',
      data: {
        employeeId: `EMP-${String(i).padStart(4, '0')}`,
        lastName: pick(LAST),
        firstName: gender === 'Male' ? pick(MALE) : pick(FEMALE),
        middleName: pick(LAST),
        extension: gender === 'Male' && rand() < 0.06 ? 'Jr.' : undefined,
        gender,
        dateOfBirth: ymd(int(1965, 2002), int(1, 12), int(1, 28)),
        civilStatus: pick(CIVIL_STATUSES.slice(0, 3)),
        religion: rand() < 0.8 ? 'Roman Catholic' : pick(['Iglesia ni Cristo', 'Born Again Christian', 'Islam', 'Seventh-day Adventist']),
        bloodType: pick(BLOOD_TYPES),
        professionalEligibility: rand() < 0.5 ? 'Career Service Professional' : rand() < 0.5 ? 'Career Service Sub-Professional' : undefined,
        contactNumber: `09${digits(9)}`,
        address: `${int(1, 999)} ${pick(['Rizal St.', 'Mabini St.', 'Bonifacio Ave.', 'Luna St.'])}, ${branch.address}`,
        email: `employee${i}@example.gov.ph`,
        educationalAttainment: pick(EDUCATIONAL_ATTAINMENTS.slice(5)),
        courses: pick(['BS Forestry', 'BS Civil Engineering', 'BS Accountancy', 'BS Information Technology', 'AB Political Science', 'BS Nursing']),
        station: branch.id,
        region: branch.region,
        position: weightedPosition(),
        natureOfWork: pick(['Office-based', 'Field work', 'Mixed']),
        dateHired,
        lastDayOfService,
        classification: classRoll < 0.25 ? 'COS' : classRoll < 0.45 ? 'Contractual' : 'Regular',
        employmentStatus,
        sss: digits(10),
        pagibig: digits(12),
        tin: digits(9) + '000',
        philhealth: digits(12),
        emergencyContactName: `${pick(FEMALE)} ${pick(LAST)}`,
        emergencyRelationship: pick(['Spouse', 'Mother', 'Father', 'Sibling']),
        emergencyContactNumber: `09${digits(9)}`,
        emergencyAddress: branch.address,
      } as never,
      ...opts,
    })
    employees.push(emp)
  }

  // Wellness leave this year and last year (never above the 5-day allowance)
  const holidays = (await payload.find({ collection: 'holidays', limit: 100, ...opts })).docs.map((h) => h.date.slice(0, 10))
  for (const emp of employees.filter((e) => e.employmentStatus === 'Active')) {
    for (const year of [thisYear - 1, thisYear]) {
      let used = 0
      const filings = int(0, 3)
      let cursorMonth = 1
      for (let f = 0; f < filings; f++) {
        cursorMonth = int(cursorMonth, Math.min(cursorMonth + 3, 12))
        const from = ymd(year, cursorMonth, int(1, 20))
        if (year === thisYear && from > today) break
        const to = addDays(from, int(0, 2))
        const days = countWorkdays(from, to, holidays).byYear[year] ?? 0
        if (!days || used + days > 5 || to.slice(0, 4) !== String(year)) continue
        used += days
        await payload.create({
          collection: 'wellness-leaves',
          data: { employee: emp.id, dateFiling: addDays(from, -int(3, 10)), inclusiveDateFrom: from, inclusiveDateTo: to, dateReceived: addDays(from, -int(0, 2)), status: 'Approved' },
          ...opts,
        })
        cursorMonth = Math.min(cursorMonth + 1, 12)
      }
    }
  }

  // Annual requirements for last year (mostly complete) and this year (in progress)
  const active = employees.filter((e) => e.employmentStatus === 'Active')
  for (const year of [thisYear - 1, thisYear]) {
    const rate = year === thisYear ? 0.55 : 0.92
    for (const emp of active) {
      for (const collection of ['itr-submissions', 'sworn-declarations', 'pds-submissions'] as const) {
        if (rand() > rate) continue
        const sub = ymd(year, int(3, 6), int(1, 28))
        await payload.create({ collection, data: { employee: emp.id, year, dateSubmitted: sub, dateReceived: addDays(sub, int(0, 5)) } as never, ...opts })
      }
      if (rand() < rate) {
        const rating = Math.round((3 + rand() * 2) * 1000) / 1000
        await payload.create({
          collection: 'ipcr-ratings',
          data: { employee: emp.id, year, ratingPeriod: 'Jan-Jun', periodFrom: ymd(year, 1, 1), periodTo: ymd(year, 6, 30), rating, dateSubmitted: ymd(year, 7, int(5, 25)) },
          ...opts,
        })
      }
    }
  }

  // Applicants in the onboarding pipeline
  const statuses = ['Pending', 'For Interview', 'For OJT', 'Hired', 'Not Hired', 'Withdrawn'] as const
  for (let i = 1; i <= 28; i++) {
    const gender = rand() < 0.5
    const reqs = Object.fromEntries(
      ONBOARDING_REQUIREMENTS.map((r) => [r.key, r.key === 'reqOrCr' || r.key === 'reqDriverLicense' ? (rand() < 0.7 ? 'N/A' : pick(['Pending', 'Submitted'])) : pick(['Pending', 'Submitted', 'Submitted', 'Verified'])]),
    )
    const applied = addDays(today, -int(5, 160))
    const status = pick(statuses)
    await payload.create({
      collection: 'applications',
      data: {
        applicationId: `APP-${thisYear}-${String(i).padStart(3, '0')}`,
        applicantName: `${gender ? pick(MALE) : pick(FEMALE)} ${pick(LAST)}`,
        positionApplied: weightedPosition(),
        station: pick(branches).id,
        replacement: rand() < 0.3 ? `${pick(FEMALE)} ${pick(LAST)}` : undefined,
        dateApplied: applied,
        startOjt: status === 'For OJT' || status === 'Hired' ? addDays(applied, int(10, 30)) : undefined,
        applicationStatus: status,
        ...reqs,
        dateSubmitted: rand() < 0.5 ? addDays(applied, int(3, 20)) : undefined,
      } as never,
      ...opts,
    })
  }

  payload.logger.info(`Seeded ${branches.length} branches, ${employees.length} employees, onboarding, leave and requirements.`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
