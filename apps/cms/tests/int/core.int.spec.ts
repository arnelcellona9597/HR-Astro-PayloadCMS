import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'

let payload: Payload
let superAdmin: any
let staff: any
let branchId: number

const PASSWORD = 'Sup3rSecret!pw'

async function asUser(email: string) {
  const res = await payload.find({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
  return { ...res.docs[0], collection: 'users' } as any
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

const trusted = { trustedAuth: true }
const login = (email: string, password: string) =>
  payload.login({ collection: 'users', data: { email, password }, context: trusted } as any) as Promise<{ token?: string }>

describe('users & accounts', () => {
  it('bootstraps the first System Admin the way the create-admin command does', async () => {
    await payload.create({
      collection: 'users',
      data: { name: 'First Admin', email: 'admin@example.com', password: PASSWORD, role: 'system-admin', status: 'approved' } as any,
      overrideAccess: true,
      context: { passwordChange: true },
    })
    superAdmin = await asUser('admin@example.com')
    expect(superAdmin).toMatchObject({ role: 'system-admin', status: 'approved', emailVerified: false })
  })

  it('refuses account creation by anyone but a System Admin', async () => {
    await expect(
      payload.create({ collection: 'users', data: { name: 'Anon', email: 'anon@example.com', password: PASSWORD } as any, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'users',
        data: { name: 'Anon', email: 'anon@example.com', password: PASSWORD } as any,
        overrideAccess: false,
        context: { registration: true },
      }),
    ).rejects.toThrow()
  })

  it('lets a System Admin create HR Staff', async () => {
    await payload.create({
      collection: 'users',
      data: { name: 'Sneaky', email: 'staff@example.com', password: PASSWORD, role: 'hr-staff', status: 'approved' } as any,
      user: superAdmin,
      overrideAccess: false,
    })
    staff = await asUser('staff@example.com')
    expect(staff.role).toBe('hr-staff')
  })

  it('rejects weak passwords', async () => {
    await expect(
      payload.create({ collection: 'users', data: { name: 'Weak', email: 'weak@example.com', password: 'short1' } as any, user: superAdmin, overrideAccess: false }),
    ).rejects.toThrow(/at least 10/)
  })

  it('only allows sign-in started by the app (2FA flow), never a plain login call', async () => {
    await expect(payload.login({ collection: 'users', data: { email: 'staff@example.com', password: PASSWORD } })).rejects.toThrow(/sign-in page/)
    const res = await login('staff@example.com', PASSWORD)
    const claims = JSON.parse(Buffer.from(res.token!.split('.')[1]!, 'base64url').toString())
    expect(claims.exp - claims.iat).toBe(12 * 60 * 60)
  })

  it('blocks disabled accounts', async () => {
    await payload.update({ collection: 'users', id: staff.id, data: { status: 'disabled' }, user: superAdmin, overrideAccess: false })
    await expect(login('staff@example.com', PASSWORD)).rejects.toThrow(/disabled/)
    await payload.update({ collection: 'users', id: staff.id, data: { status: 'approved' }, user: superAdmin, overrideAccess: false })
    staff = await asUser('staff@example.com')
  })

  it('does not let HR Staff promote themselves, change their email, or set a password without proof', async () => {
    await payload.update({ collection: 'users', id: staff.id, data: { role: 'system-admin', email: 'evil@example.com' } as any, user: staff, overrideAccess: false })
    const after = await asUser('staff@example.com')
    expect(after.role).toBe('hr-staff')
    expect(after.email).toBe('staff@example.com')
    await expect(
      payload.update({ collection: 'users', id: staff.id, data: { password: 'NewPassw0rd99' } as any, user: staff, overrideAccess: false }),
    ).rejects.toThrow(/My account/)
    await payload.update({ collection: 'users', id: staff.id, data: { password: 'NewPassw0rd99' } as any, user: staff, overrideAccess: false, context: { passwordChange: true } })
    await expect(login('staff@example.com', 'NewPassw0rd99')).resolves.toBeTruthy()
  })

  it('does not let HR Staff read or create HR accounts', async () => {
    const res = await payload.find({ collection: 'users', user: staff, overrideAccess: false })
    expect(res.docs.map((d) => d.email)).toEqual(['staff@example.com'])
    await expect(
      payload.create({ collection: 'users', data: { name: 'X', email: 'x@example.com', password: PASSWORD } as any, user: staff, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('resets email verification when a System Admin changes an address', async () => {
    await payload.update({ collection: 'users', id: staff.id, data: { emailVerified: true } as any, overrideAccess: true })
    const u = await payload.update({ collection: 'users', id: staff.id, data: { email: 'staff2@example.com' }, user: superAdmin, overrideAccess: false })
    expect(u.emailVerified).toBe(false)
    await payload.update({ collection: 'users', id: staff.id, data: { email: 'staff@example.com' }, user: superAdmin, overrideAccess: false })
    staff = await asUser('staff@example.com')
  })

  it('keeps at least one System Admin', async () => {
    await expect(
      payload.update({ collection: 'users', id: superAdmin.id, data: { role: 'hr-staff' }, user: superAdmin, overrideAccess: false }),
    ).rejects.toThrow(/System Admin must remain/)
  })
})

describe('employees', () => {
  it('normalizes IDs, dates and computes age / length of service', async () => {
    const branch = await payload.create({ collection: 'branches', data: { name: 'Main Office', code: 'MAIN' }, user: staff, overrideAccess: false })
    branchId = branch.id
    const emp = await payload.create({
      collection: 'employees',
      data: {
        employeeId: '  EMP-0001 ',
        lastName: 'dela Cruz',
        firstName: 'Juan',
        middleName: 'Perez',
        gender: 'Male',
        classification: 'Regular',
        employmentStatus: 'Active',
        dateOfBirth: '1990-07-15',
        dateHired: '2015-06-01',
        station: branchId,
        sss: '0412345678',
        tin: '001234567000',
        position: '  Administrative   Officer ',
      },
      user: staff,
      overrideAccess: false,
    })
    expect(emp.employeeId).toBe('EMP-0001')
    expect(emp.sss).toBe('04-1234567-8')
    expect(emp.tin).toBe('001-234-567-000')
    expect(emp.dateOfBirth).toBe('1990-07-15T12:00:00.000Z')
    expect(emp.fullName).toBe('dela Cruz, Juan P.')
    expect(emp.position).toBe('Administrative Officer')
    expect(typeof emp.age).toBe('number')
    expect(emp.lengthOfService).toMatch(/yrs/)
  })

  it('rejects invalid government IDs and duplicate employee IDs', async () => {
    const base = { lastName: 'X', firstName: 'Y', gender: 'Female', classification: 'COS', employmentStatus: 'Active' } as const
    await expect(
      payload.create({ collection: 'employees', data: { ...base, employeeId: 'EMP-0002', sss: '123' }, user: staff, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'employees', data: { ...base, employeeId: 'EMP-0001' }, user: staff, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('rejects last day of service before date hired', async () => {
    await expect(
      payload.create({
        collection: 'employees',
        data: {
          employeeId: 'EMP-0003',
          lastName: 'A',
          firstName: 'B',
          gender: 'Female',
          classification: 'COS',
          employmentStatus: 'Resigned',
          dateHired: '2020-01-01',
          lastDayOfService: '2019-01-01',
        },
        user: staff,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('lets HR Staff delete records', async () => {
    const tmp = await payload.create({
      collection: 'employees',
      data: { employeeId: 'TMP-1', lastName: 'Tmp', firstName: 'Del', gender: 'Male', classification: 'COS', employmentStatus: 'Active' },
      user: staff,
      overrideAccess: false,
    })
    await payload.delete({ collection: 'employees', id: tmp.id, user: staff, overrideAccess: false })
    expect((await payload.count({ collection: 'employees', where: { employeeId: { equals: 'TMP-1' } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('writes an audit trail of changes', async () => {
    const emp = (await payload.find({ collection: 'employees', where: { employeeId: { equals: 'EMP-0001' } }, overrideAccess: true })).docs[0]!
    await payload.update({ collection: 'employees', id: emp.id, data: { position: 'Admin Officer II' }, user: staff, overrideAccess: false })
    const logs = await payload.find({
      collection: 'audit-logs',
      where: { and: [{ collectionSlug: { equals: 'employees' } }, { action: { equals: 'update' } }] },
      overrideAccess: true,
    })
    expect(logs.docs[0]?.changes).toMatchObject({ position: { from: 'Administrative Officer', to: 'Admin Officer II' } })
    expect(logs.docs[0]?.userName).toBe('Sneaky')
  })
})

describe('wellness leave', () => {
  let empId: number
  beforeAll(async () => {
    const emp = (await payload.find({ collection: 'employees', where: { employeeId: { equals: 'EMP-0001' } }, overrideAccess: true })).docs[0]!
    empId = emp.id
    await payload.create({ collection: 'holidays', data: { date: '2025-01-01', name: "New Year's Day" }, user: staff, overrideAccess: false })
  })

  const file = (from: string, to: string, extra: Record<string, unknown> = {}) =>
    payload.create({
      collection: 'wellness-leaves',
      data: { employee: empId, dateFiling: from, inclusiveDateFrom: from, inclusiveDateTo: to, ...extra } as any,
      user: staff,
      overrideAccess: false,
    })

  it('counts working days and copies the employee name', async () => {
    // Mon 2024-03-04 .. Wed 2024-03-06
    const leave = await file('2024-03-04', '2024-03-06')
    expect(leave.days).toBe(3)
    expect(leave.lastName).toBe('dela Cruz')
    expect(leave.year).toBe(2024)
  })

  it('blocks a filing over the yearly allowance (default 5)', async () => {
    await expect(file('2024-04-01', '2024-04-03')).rejects.toThrow(/2 of 5 day/)
    const ok = await file('2024-04-01', '2024-04-02')
    expect(ok.days).toBe(2)
  })

  it('does not count cancelled filings', async () => {
    const c = await file('2024-05-06', '2024-05-06', { status: 'Cancelled' })
    expect(c.days).toBe(1)
  })

  it('blocks overlapping filings', async () => {
    await expect(file('2025-03-04', '2025-03-04')).resolves.toBeTruthy()
    await expect(file('2025-03-04', '2025-03-05')).rejects.toThrow(/overlap/)
  })

  it('splits a Dec–Jan filing across both years and skips holidays', async () => {
    await payload.create({ collection: 'holidays', data: { date: '2026-01-01', name: "New Year's Day" }, user: staff, overrideAccess: false })
    const l = await file('2025-12-30', '2026-01-02', {})
    expect(l.daysByYear).toEqual({ '2025': 2, '2026': 1 })
  })

  it('honours a per-year override of the allowance', async () => {
    await payload.updateGlobal({
      slug: 'leave-settings',
      data: { annualAllowance: 5, yearOverrides: [{ year: 2027, allowance: 1 }] },
      user: superAdmin,
      overrideAccess: false,
    })
    await expect(file('2027-03-01', '2027-03-02')).rejects.toThrow(/1 of 1 day/)
  })
})

describe('annual requirements', () => {
  it('fills employee details and rejects duplicates per year', async () => {
    const emp = (await payload.find({ collection: 'employees', where: { employeeId: { equals: 'EMP-0001' } }, overrideAccess: true })).docs[0]!
    const rec = await payload.create({
      collection: 'sworn-declarations',
      data: { employee: emp.id, year: 2025, dateSubmitted: '2025-04-10' },
      user: staff,
      overrideAccess: false,
    })
    expect(rec.lastName).toBe('dela Cruz')
    expect(rec.station).toBe('Main Office')
    expect(rec.tin).toBe('001-234-567-000')
    await expect(
      payload.create({ collection: 'sworn-declarations', data: { employee: emp.id, year: 2025 }, user: staff, overrideAccess: false }),
    ).rejects.toThrow(/already has/)
  })

  it('computes the IPCR adjectival rating', async () => {
    const emp = (await payload.find({ collection: 'employees', where: { employeeId: { equals: 'EMP-0001' } }, overrideAccess: true })).docs[0]!
    const rec = await payload.create({
      collection: 'ipcr-ratings',
      data: { employee: emp.id, year: 2025, ratingPeriod: 'Jan-Jun', rating: 4.5678 },
      user: staff,
      overrideAccess: false,
    })
    expect(rec.rating).toBe(4.568)
    expect(rec.adjectivalRating).toBe('Outstanding')
    const updated = await payload.update({
      collection: 'ipcr-ratings',
      id: rec.id,
      data: { remarks: 'ok' },
      user: staff,
      overrideAccess: false,
    })
    expect(updated.adjectivalRating).toBe('Outstanding')
  })
})

describe('onboarding', () => {
  it('computes requirement status', async () => {
    const app = await payload.create({
      collection: 'applications',
      data: { applicationId: 'APP-1', applicantName: 'Maria Santos', positionApplied: 'Clerk', dateApplied: '2025-02-01', reqPds: 'Submitted' } as any,
      user: staff,
      overrideAccess: false,
    })
    expect(app.requirementsStatus).toBe('Incomplete')
    expect(app.requirementsMissing).toBe(9)
    const all = Object.fromEntries(
      ['reqSpecimenSign', 'reqSwornDeclaration', 'reqTinVerification', 'reqPoliceClearance', 'reqMedicalLab', 'reqLandbankAccount', 'reqAssumptionOfDuty'].map((k) => [k, 'Verified']),
    )
    const done = await payload.update({
      collection: 'applications',
      id: app.id,
      data: { ...all, reqDriverLicense: 'N/A', reqOrCr: 'N/A' },
      user: staff,
      overrideAccess: false,
    })
    expect(done.requirementsStatus).toBe('Complete')
  })
})
