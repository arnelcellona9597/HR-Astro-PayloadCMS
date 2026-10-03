// Excel export/import of one payroll period. Columns follow the payslip template's pay items.
import ExcelJS from 'exceljs'
import type { Payload } from 'payload'

import { cellText, headerKey, isBlank, plainValue } from './excel/cells'
import { itemLabels, saveGrid, type GridRow } from './payroll'

type User = { id: number; name?: string | null; email?: string | null }

const FIXED = { id: 'Employee ID', name: 'Name', gross: 'Gross Pay', ded: 'Total Deductions', net: 'Net Pay', remarks: 'Remarks' }
const MONEY = '#,##0.00'

export async function exportPeriodWorkbook(payload: Payload, periodId: number): Promise<{ filename: string; buffer: Buffer }> {
  const [period, settings, slips] = await Promise.all([
    payload.findByID({ collection: 'payroll-periods', id: periodId, overrideAccess: true }),
    payload.findGlobal({ slug: 'payslip-settings', overrideAccess: true }),
    payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, sort: 'fullName', pagination: false, depth: 0, overrideAccess: true }),
  ])
  const { earnings, deductions } = itemLabels(settings)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Payroll', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] })
  const cols = [
    { header: FIXED.id, key: 'id', width: 14, style: { numFmt: '@' } },
    { header: FIXED.name, key: 'name', width: 28 },
    ...earnings.map((l, i) => ({ header: l, key: `e${i}`, width: 14, style: { numFmt: MONEY } })),
    { header: FIXED.gross, key: 'gross', width: 14, style: { numFmt: MONEY } },
    ...deductions.map((l, i) => ({ header: l, key: `d${i}`, width: 14, style: { numFmt: MONEY } })),
    { header: FIXED.ded, key: 'ded', width: 16, style: { numFmt: MONEY } },
    { header: FIXED.net, key: 'net', width: 14, style: { numFmt: MONEY } },
    { header: FIXED.remarks, key: 'remarks', width: 30 },
  ]
  ws.columns = cols
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { wrapText: true, vertical: 'middle' }
  header.height = 30
  cols.forEach((c, i) => {
    const computed = c.key === 'name' || c.key === 'gross' || c.key === 'ded' || c.key === 'net'
    header.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: computed ? 'FFF1F1F1' : 'FFE8EEF8' } }
    if (computed) header.getCell(i + 1).note = 'Calculated by the system. Ignored when importing.'
  })
  for (const s of slips.docs) {
    const amount = (items: { label: string; amount: number }[] | null | undefined, label: string) => items?.find((i) => i.label === label)?.amount ?? 0
    ws.addRow({
      id: s.employeeCode,
      name: s.fullName,
      ...Object.fromEntries(earnings.map((l, i) => [`e${i}`, amount(s.earnings, l)])),
      gross: s.grossPay ?? 0,
      ...Object.fromEntries(deductions.map((l, i) => [`d${i}`, amount(s.deductions, l)])),
      ded: s.totalDeductions ?? 0,
      net: s.netPay ?? 0,
      remarks: s.remarks ?? null,
    })
  }
  return { filename: `payroll-${period.code}.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) }
}

export type PayrollImportPlan = {
  rows: (GridRow & { line: number; label: string; action: 'create' | 'update' })[]
  errors: { row?: number; column?: string; message: string }[]
  warnings: string[]
}

/** Reads a payroll workbook against a period. Nothing is written. */
export async function analyzePayrollWorkbook(payload: Payload, periodId: number, buffer: ArrayBuffer | Buffer): Promise<PayrollImportPlan> {
  const plan: PayrollImportPlan = { rows: [], errors: [], warnings: [] }
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as ArrayBuffer)
  } catch {
    plan.errors.push({ message: 'This file could not be read. Upload an .xlsx Excel workbook.' })
    return plan
  }
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0)
  if (!ws) {
    plan.errors.push({ message: 'The workbook is empty.' })
    return plan
  }
  const settings = await payload.findGlobal({ slug: 'payslip-settings', overrideAccess: true })
  const { earnings, deductions } = itemLabels(settings)
  const colOf = new Map<string, number>()
  ws.getRow(1).eachCell((c, n) => colOf.set(headerKey(plainValue(c.value)), n))
  const idCol = colOf.get(headerKey(FIXED.id))
  if (!idCol) {
    plan.errors.push({ message: `Missing the "${FIXED.id}" column.` })
    return plan
  }
  const itemCols = [
    ...earnings.map((l) => ({ key: `e:${l}`, label: l, col: colOf.get(headerKey(l)) })),
    ...deductions.map((l) => ({ key: `d:${l}`, label: l, col: colOf.get(headerKey(l)) })),
  ]
  const missing = itemCols.filter((c) => !c.col).map((c) => c.label)
  if (missing.length) plan.warnings.push(`Columns not in the file (left unchanged): ${missing.join(', ')}.`)
  const remarksCol = colOf.get(headerKey(FIXED.remarks))

  const [employees, slips, period] = await Promise.all([
    payload.find({ collection: 'employees', pagination: false, depth: 0, overrideAccess: true, select: { employeeId: true, fullName: true } }),
    payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, pagination: false, depth: 0, overrideAccess: true, select: { employee: true } }),
    payload.findByID({ collection: 'payroll-periods', id: periodId, overrideAccess: true }),
  ])
  const empByCode = new Map(employees.docs.map((e) => [e.employeeId.toLowerCase(), e]))
  const hasSlip = new Set(slips.docs.map((s) => (typeof s.employee === 'object' ? s.employee.id : s.employee)))
  const seen = new Map<number, number>()

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const code = cellText(plainValue(row.getCell(idCol).value))
    const values: Record<string, string> = {}
    for (const c of itemCols) {
      if (!c.col) continue
      const v = plainValue(row.getCell(c.col).value)
      if (!isBlank(v)) values[c.key] = typeof v === 'number' ? String(v) : String(v).trim()
    }
    if (!code && !Object.keys(values).length) continue
    if (!code) {
      plan.errors.push({ row: r, column: FIXED.id, message: 'is required' })
      continue
    }
    const emp = empByCode.get(code.toLowerCase())
    if (!emp) {
      plan.errors.push({ row: r, column: FIXED.id, message: `no employee with Employee ID "${code}"` })
      continue
    }
    if (seen.has(emp.id)) {
      plan.errors.push({ row: r, message: `Duplicate of row ${seen.get(emp.id)} (same employee).` })
      continue
    }
    seen.set(emp.id, r)
    // Blank amount cells mean 0 for items in the file.
    for (const c of itemCols) if (c.col && values[c.key] === undefined) values[c.key] = '0'
    plan.rows.push({
      line: r,
      label: emp.fullName ?? code,
      employeeId: emp.id,
      values,
      remarks: remarksCol ? (cellText(plainValue(row.getCell(remarksCol).value)) ?? '') : undefined,
      action: hasSlip.has(emp.id) ? 'update' : 'create',
    })
  }
  if (period.status === 'Released') plan.warnings.push('This period was already released: changed payslips will be marked "corrected after release".')
  if (!plan.rows.length && !plan.errors.length) plan.errors.push({ message: 'No rows to import.' })
  return plan
}

/** Validates every row (same rules as the grid) and saves them all in one transaction. */
export async function commitPayrollImport(payload: Payload, user: User, periodId: number, plan: PayrollImportPlan) {
  const res = await saveGrid(payload, user, periodId, plan.rows)
  if (!res.ok) {
    return {
      ok: false as const,
      errors: res.errors.map((e) => ({ row: e.row !== undefined ? plan.rows[e.row]?.line : undefined, message: e.message })),
    }
  }
  return res
}
