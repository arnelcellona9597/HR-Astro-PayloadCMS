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

describe('users & registration', () => {
  it('makes the first registered user an approved Super Admin', async () => {
    const u = await payload.create({
      collection: 'users',
      data: { name: 'First Admin', email: 'admin@example.com', password: PASSWORD } as any,
      overrideAccess: false,
    })
    superAdmin = await asUser('admin@example.com')
    expect(superAdmin.role).toBe('super-admin')
    expect(superAdmin.status).toBe('approved')
    expect(u.id).toBeDefined()
  })

  it('creates later sign-ups as pending HR Staff, even if they ask for more', async () => {
    await payload.create({
      collection: 'users',
      data: { name: 'Sneaky', email: 'staff@example.com', password: PASSWORD, role: 'super-admin', status: 'approved' } as any,
      overrideAccess: false,
    })
    const u = await asUser('staff@example.com')
    expect(u.role).toBe('hr-staff')
    expect(u.status).toBe('pending')
  })

  it('rejects weak passwords', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { name: 'Weak', email: 'weak@example.com', password: 'short1' } as any,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/at least 10/)
  })

  it('blocks login until approved', async () => {
    await expect(
      payload.login({ collection: 'users', data: { email: 'staff@example.com', password: PASSWORD } }),
    ).rejects.toThrow(/approval/)
  })

  it('lets a Super Admin approve, after which login works', async () => {
    const pending = await asUser('staff@example.com')
    await payload.update({ collection: 'users', id: pending.id, data: { status: 'approved' }, user: superAdmin, overrideAccess: false })
    const res = await payload.login({ collection: 'users', data: { email: 'staff@example.com', password: PASSWORD } })
    expect(res.token).toBeTruthy()
    staff = await asUser('staff@example.com')
  })

  it('does not let HR Staff promote themselves', async () => {
    await payload.update({ collection: 'users', id: staff.id, data: { role: 'super-admin' } as any, user: staff, overrideAccess: false })
    const after = await asUser('staff@example.com')
    expect(after.role).toBe('hr-staff')
  })

  it('does not let HR Staff read other users', async () => {
    const res = await payload.find({ collection: 'users', user: staff, overrideAccess: false })
    expect(res.docs.map((d) => d.email)).toEqual(['staff@example.com'])
  })

  it('keeps at least one Super Admin', async () => {
    await expect(
      payload.update({ collection: 'users', id: superAdmin.id, data: { role: 'hr-admin' }, user: superAdmin, overrideAccess: false }),
    ).rejects.toThrow(/Super Admin must remain/)
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

  it('only lets HR admins delete', async () => {
    const emp = await payload.find({ collection: 'employees', where: { employeeId: { equals: 'EMP-0001' } }, overrideAccess: true })
    await expect(payload.delete({ collection: 'employees', id: emp.docs[0]!.id, user: staff, overrideAccess: false })).rejects.toThrow()
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
