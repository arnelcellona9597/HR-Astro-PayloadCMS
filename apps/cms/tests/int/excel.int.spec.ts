import { ALL_MODULES, EMPLOYEES } from '@hr/shared/modules'
import ExcelJS from 'exceljs'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { cellDate } from '../../src/server/excel/cells'
import { allModuleRequests, buildTemplate, buildWorkbook } from '../../src/server/excel/export'
import { analyzeWorkbook, commit, validateImport } from '../../src/server/excel/import'

let payload: Payload
let admin: any

const opts = () => ({ user: admin, overrideAccess: false })

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}
async function save(wb: ExcelJS.Workbook) {
  return Buffer.from(await wb.xlsx.writeBuffer())
}
function colOf(ws: ExcelJS.Worksheet, header: string) {
  let idx = 0
  ws.getRow(1).eachCell((c, n) => {
    if (String(c.value) === header) idx = n
  })
  if (!idx) throw new Error(`no column ${header}`)
  return idx
}
const counts = async () =>
  Object.fromEntries(
    await Promise.all(ALL_MODULES.map(async (m) => [m.slug, (await payload.count({ collection: m.slug as never, overrideAccess: true })).totalDocs])),
  )

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await payload.create({
    collection: 'users',
    data: { name: 'Admin', email: 'a@x.test', password: 'Sup3rSecret!pw', role: 'system-admin', status: 'approved' } as any,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  admin = { ...(await payload.find({ collection: 'users', overrideAccess: true })).docs[0], collection: 'users' }
  const b = await payload.create({ collection: 'branches', data: { name: 'Main Office', code: 'MAIN' }, ...opts() })
  await payload.create({ collection: 'holidays', data: { date: '2025-06-12', name: 'Independence Day' }, ...opts() })
  const e = await payload.create({
    collection: 'employees',
    data: {
      employeeId: '00123',
      lastName: 'Santos',
      firstName: 'Maria',
      middleName: 'Reyes',
      gender: 'Female',
      classification: 'Regular',
      employmentStatus: 'Active',
      dateOfBirth: '1990-02-28',
      dateHired: '2015-06-01',
      station: b.id,
      sss: '0412345678',
      tin: '001234567',
      philhealth: '010000000001',
      pagibig: '012345678901',
      remarks: 'Line one\nLine two',
    },
    ...opts(),
  })
  await payload.create({
    collection: 'wellness-leaves',
    data: { employee: e.id, dateFiling: '2025-03-01', inclusiveDateFrom: '2025-03-03', inclusiveDateTo: '2025-03-04' } as any,
    ...opts(),
  })
  await payload.create({ collection: 'ipcr-ratings', data: { employee: e.id, year: 2025, ratingPeriod: 'Jan-Jun', rating: 4.25 } as any, ...opts() })
  await payload.create({
    collection: 'applications',
    data: { applicationId: 'APP-1', applicantName: 'Pedro Cruz', positionApplied: 'Clerk', dateApplied: '2025-02-01', reqPds: 'Verified' } as any,
    ...opts(),
  })
})

describe('excel cells', () => {
  it('parses dates safely', () => {
    expect(cellDate(new Date('2024-03-05T00:00:00Z'))).toEqual({ ok: true, ymd: '2024-03-05' })
    expect(cellDate(new Date('2024-03-04T23:59:59.999Z'))).toEqual({ ok: true, ymd: '2024-03-05' })
    expect(cellDate(45356)).toEqual({ ok: true, ymd: '2024-03-05' })
    expect(cellDate(1)).toEqual({ ok: true, ymd: '1900-01-01' })
    expect(cellDate(61)).toEqual({ ok: true, ymd: '1900-03-01' })
    expect(cellDate(60).ok).toBe(false)
    expect(cellDate(0, true).ok).toBe(false)
    expect(cellDate(1, true)).toEqual({ ok: true, ymd: '1904-01-02' })
    expect(cellDate('2024-3-5')).toEqual({ ok: true, ymd: '2024-03-05' })
    expect(cellDate('Mar 5, 2024')).toEqual({ ok: true, ymd: '2024-03-05' })
    expect(cellDate('5 March 2024')).toEqual({ ok: true, ymd: '2024-03-05' })
    expect(cellDate('03/05/2024').ok).toBe(false)
    expect(cellDate('2023-02-29').ok).toBe(false)
  })
})

describe('export → import round trip', () => {
  it('re-importing an unchanged export changes nothing', async () => {
    const buf = await buildWorkbook(payload, admin, allModuleRequests())
    const plan = await validateImport(payload, admin, buf)
    expect(plan.errors).toEqual([])
    for (const s of plan.sheets) {
      expect({ sheet: s.sheet, create: s.create, update: s.update }).toEqual({ sheet: s.sheet, create: 0, update: 0 })
    }
    expect(plan.plans.length).toBeGreaterThanOrEqual(6)
  })

  it('keeps leading zeros and canonical ID formats in the file', async () => {
    const wb = await load(await buildWorkbook(payload, admin, [{ module: EMPLOYEES }]))
    const ws = wb.getWorksheet('Employees')!
    expect(ws.getRow(2).getCell(colOf(ws, 'Employee ID')).value).toBe('00123')
    expect(ws.getRow(2).getCell(colOf(ws, 'SSS Number')).value).toBe('04-1234567-8')
    expect(ws.getRow(2).getCell(colOf(ws, 'Date of Birth')).value).toEqual(new Date('1990-02-28T00:00:00.000Z'))
  })

  it('the template imports as empty', async () => {
    const plan = await analyzeWorkbook(payload, await buildTemplate())
    expect(plan.errors).toEqual([])
    expect(plan.plans).toHaveLength(0)
  })
})

describe('import changes', () => {
  it('creates, updates and links rows across sheets in one go', async () => {
    const wb = await load(await buildWorkbook(payload, admin, allModuleRequests()))
    // New branch, referenced by a new employee, who gets a leave filing — all in the same file.
    const br = wb.getWorksheet('Branches')!
    br.addRow(['North Station', 'NS', 'Somewhere', 'NCR'])
    const emp = wb.getWorksheet('Employees')!
    const row = emp.addRow([])
    row.getCell(colOf(emp, 'Employee ID')).value = 'EMP-9'
    row.getCell(colOf(emp, 'Last Name')).value = 'Reyes'
    row.getCell(colOf(emp, 'First Name')).value = 'Jose'
    row.getCell(colOf(emp, 'Gender')).value = 'male'
    row.getCell(colOf(emp, 'Classification')).value = 'COS'
    row.getCell(colOf(emp, 'Employment Status')).value = 'Active'
    row.getCell(colOf(emp, 'Station / Division / Unit')).value = 'North Station'
    row.getCell(colOf(emp, 'Date Hired')).value = 45356 // serial date
    emp.getRow(2).getCell(colOf(emp, 'Position / Designation')).value = 'HR Officer'
    const lv = wb.getWorksheet('Wellness Leave')!
    lv.addRow(['EMP-9', null, null, null, '2025-05-01', '2025-05-05', '2025-05-06', null, null, null, 'Approved'])

    const before = await counts()
    const plan = await validateImport(payload, admin, await save(wb))
    expect(plan.errors).toEqual([])
    const byModule = Object.fromEntries(plan.sheets.map((s) => [s.module, s]))
    expect(byModule.branches.create).toBe(1)
    expect(byModule.employees.create).toBe(1)
    expect(byModule.employees.update).toBe(1)
    expect(byModule['wellness-leaves'].create).toBe(1)
    // Validation must not write anything
    expect(await counts()).toEqual(before)

    const res = await commit(payload, admin, plan)
    expect(res.ok).toBe(true)
    const jose = (await payload.find({ collection: 'employees', where: { employeeId: { equals: 'EMP-9' } }, depth: 1, overrideAccess: true })).docs[0]!
    expect((jose.station as any).name).toBe('North Station')
    expect(jose.gender).toBe('Male')
    expect(jose.dateHired).toBe('2024-03-05T12:00:00.000Z')
    const leave = (await payload.find({ collection: 'wellness-leaves', where: { employee: { equals: jose.id } }, overrideAccess: true })).docs[0]!
    expect(leave.days).toBe(2) // Mon 5 – Tue 6 May
    const maria = (await payload.find({ collection: 'employees', where: { employeeId: { equals: '00123' } }, overrideAccess: true })).docs[0]!
    expect(maria.position).toBe('HR Officer')
    expect(maria.remarks).toBe('Line one\nLine two')
    const audit = await payload.find({ collection: 'audit-logs', where: { action: { equals: 'import' } }, overrideAccess: true })
    expect(audit.totalDocs).toBe(4)
  })

  it('rejects the whole file when any cell is invalid', async () => {
    const wb = await load(await buildWorkbook(payload, admin, [{ module: EMPLOYEES }]))
    const ws = wb.getWorksheet('Employees')!
    ws.getRow(2).getCell(colOf(ws, 'Position / Designation')).value = 'Changed'
    const bad = ws.addRow([])
    bad.getCell(colOf(ws, 'Employee ID')).value = 'EMP-10'
    bad.getCell(colOf(ws, 'Last Name')).value = 'X'
    bad.getCell(colOf(ws, 'First Name')).value = 'Y'
    bad.getCell(colOf(ws, 'Gender')).value = 'Female'
    bad.getCell(colOf(ws, 'Classification')).value = 'Permanent'
    bad.getCell(colOf(ws, 'Employment Status')).value = 'Active'
    bad.getCell(colOf(ws, 'SSS Number')).value = 412345678 // leading zero lost by Excel
    bad.getCell(colOf(ws, 'Date of Birth')).value = '03/05/1990'
    const plan = await validateImport(payload, admin, await save(wb))
    const messages = plan.errors.map((e) => `${e.column}: ${e.message}`)
    expect(messages.some((m) => m.startsWith('Classification') && m.includes('Permanent'))).toBe(true)
    expect(messages.some((m) => m.startsWith('SSS Number') && m.includes('leading zero'))).toBe(true)
    expect(messages.some((m) => m.startsWith('Date of Birth') && m.includes('ambiguous'))).toBe(true)
  })

  it('catches business rules in the rehearsal and leaves the database untouched', async () => {
    const wb = await load(await buildWorkbook(payload, admin, [{ module: EMPLOYEES }, { module: ALL_MODULES.find((m) => m.slug === 'wellness-leaves')! }]))
    const lv = wb.getWorksheet('Wellness Leave')!
    // Maria already used 2 days in 2025; 4 more working days would exceed the 5-day allowance.
    lv.addRow(['00123', null, null, null, '2025-07-01', '2025-07-07', '2025-07-10', null, null, null, 'Approved'])
    const emp = wb.getWorksheet('Employees')!
    emp.getRow(2).getCell(colOf(emp, 'Remark')).value = 'Should not be saved'
    const before = await counts()
    const plan = await validateImport(payload, admin, await save(wb))
    expect(plan.errors.some((e) => /allowance/.test(e.message))).toBe(true)
    expect(await counts()).toEqual(before)
    const maria = (await payload.find({ collection: 'employees', where: { employeeId: { equals: '00123' } }, overrideAccess: true })).docs[0]!
    expect(maria.remarks).toBe('Line one\nLine two')
  })

  it('a failing commit rolls back every row', async () => {
    const wb = await load(await buildWorkbook(payload, admin, [{ module: EMPLOYEES }]))
    const ws = wb.getWorksheet('Employees')!
    ws.getRow(2).getCell(colOf(ws, 'Remark')).value = 'Partial write?'
    const plan = await analyzeWorkbook(payload, await save(wb))
    // Sneak an invalid change past static checks to force a failure in the middle of the commit.
    plan.plans.push({ ...plan.plans[0]!, action: 'update', data: { lastDayOfService: '1900-01-01' }, row: 99 })
    const res = await commit(payload, admin, plan)
    expect(res.ok).toBe(false)
    const maria = (await payload.find({ collection: 'employees', where: { employeeId: { equals: '00123' } }, overrideAccess: true })).docs[0]!
    expect(maria.remarks).toBe('Line one\nLine two')
  })

  it('flags duplicate keys and unknown references', async () => {
    const wb = await load(await buildWorkbook(payload, admin, [{ module: EMPLOYEES }]))
    const ws = wb.getWorksheet('Employees')!
    const copy = ws.addRow((ws.getRow(2).values as unknown[]).slice(1))
    copy.commit()
    const r = ws.addRow([])
    r.getCell(colOf(ws, 'Employee ID')).value = 'EMP-11'
    r.getCell(colOf(ws, 'Last Name')).value = 'A'
    r.getCell(colOf(ws, 'First Name')).value = 'B'
    r.getCell(colOf(ws, 'Gender')).value = 'Male'
    r.getCell(colOf(ws, 'Classification')).value = 'COS'
    r.getCell(colOf(ws, 'Employment Status')).value = 'Active'
    r.getCell(colOf(ws, 'Station / Division / Unit')).value = 'Atlantis'
    const plan = await analyzeWorkbook(payload, await save(wb))
    expect(plan.errors.some((e) => /Duplicate of row 2/.test(e.message))).toBe(true)
    expect(plan.errors.some((e) => /Atlantis/.test(e.message))).toBe(true)
  })
})
