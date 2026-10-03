// Excel export: one sheet per module, headers exactly as HR uses them, IDs kept as text, dates as
// real Excel dates. The same column definitions drive the import, so an exported file can be
// edited and imported back.
import { toYmd } from '@hr/shared'
import { ALL_MODULES, type ModuleDef, type ModuleField } from '@hr/shared/modules'
import ExcelJS from 'exceljs'
import type { CollectionSlug, Payload, Where } from 'payload'

import { remainingAfter } from '../leave'
import { ymdToExcelDate } from './cells'

type Doc = Record<string, unknown>
type User = Parameters<Payload['find']>[0]['user']

export type ExportRequest = { module: ModuleDef; where?: Where; sort?: string | string[] }

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF8' } }
const COMPUTED_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F1' } }

function cellFor(f: ModuleField, doc: Doc, extra: Doc): ExcelJS.CellValue {
  const v = f.name in extra ? extra[f.name] : doc[f.name]
  if (v === null || v === undefined || v === '') return null
  switch (f.kind) {
    case 'date': {
      const ymd = toYmd(v)
      return ymd ? ymdToExcelDate(ymd) : null
    }
    case 'branch':
      return typeof v === 'object' ? ((v as Doc).name as string) ?? null : null
    case 'employee':
      return typeof v === 'object' ? ((v as Doc).employeeId as string) ?? null : null
    case 'number':
    case 'year':
      return typeof v === 'number' ? v : Number(v)
    default:
      return String(v)
  }
}

function addSheet(wb: ExcelJS.Workbook, mod: ModuleDef, docs: Doc[], extras: Map<unknown, Doc>) {
  const ws = wb.addWorksheet(mod.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = mod.fields.map((f) => ({
    header: f.label,
    key: f.name,
    width: f.width ?? Math.max(12, Math.min(28, f.label.length + 4)),
    style: f.kind === 'date' ? { numFmt: 'yyyy-mm-dd' } : f.kind === 'number' || f.kind === 'year' ? {} : { numFmt: '@' },
  }))
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle', wrapText: true }
  header.height = 30
  mod.fields.forEach((f, i) => {
    const cell = header.getCell(i + 1)
    cell.fill = f.computed ? COMPUTED_FILL : HEADER_FILL
    if (f.computed) cell.note = 'Calculated by the system. Ignored when importing.'
    else if (f.required) cell.note = 'Required'
  })
  for (const doc of docs) {
    const extra = extras.get(doc.id) ?? {}
    ws.addRow(Object.fromEntries(mod.fields.map((f) => [f.name, cellFor(f, doc, extra)])))
  }
  // Dropdowns for fixed lists so values typed in Excel stay valid.
  const last = Math.max(docs.length + 200, 1000)
  mod.fields.forEach((f, i) => {
    if (f.kind !== 'select' || !f.options || f.computed) return
    const list = `"${f.options.join(',')}"`
    if (list.length > 255) return // Excel limit for inline lists
    const col = ws.getColumn(i + 1).letter
    ;(ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(`${col}2:${col}${last}`, {
      type: 'list',
      allowBlank: !f.required,
      formulae: [list],
      showErrorMessage: true,
      errorTitle: f.label,
      error: `Choose one of: ${f.options.join(', ')}`,
    })
  })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: mod.fields.length } }
}

const SORTS: Record<string, string[]> = {
  employees: ['lastName', 'firstName', 'employeeId'],
  branches: ['name'],
  holidays: ['date'],
  applications: ['dateApplied', 'applicationId'],
  'wellness-leaves': ['lastName', 'firstName', 'inclusiveDateFrom'],
}

async function fetchAll(payload: Payload, user: User, req: ExportRequest): Promise<Doc[]> {
  const res = await payload.find({
    collection: req.module.slug as CollectionSlug,
    where: req.where ?? {},
    sort: req.sort ?? SORTS[req.module.slug] ?? ['-year', 'lastName', 'firstName'],
    pagination: false,
    depth: 1,
    user,
    overrideAccess: false,
    populate: { branches: { name: true }, employees: { employeeId: true }, media: {} } as never,
  })
  return res.docs as unknown as Doc[]
}

function readme(wb: ExcelJS.Workbook, counts: { sheet: string; rows: number }[], company: string) {
  const ws = wb.addWorksheet('README')
  ws.getColumn(1).width = 110
  const lines = [
    `${company} — HR data export`,
    `Exported ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Asia/Manila)`,
    '',
    ...counts.map((c) => `${c.sheet}: ${c.rows} row(s)`),
    '',
    'How to edit and import back:',
    '• Keep the header row exactly as it is. Grey columns are calculated by the system and are ignored on import.',
    '• Records are matched by their key: Employee ID (employees), Application ID (onboarding), Branch Name (branches),',
    '  Date (holidays), Employee ID + Inclusive Date From (wellness leave), Employee ID + Year [+ Rating Period] (requirements).',
    '• A blank cell clears that value. Rows you delete from the file are NOT deleted from the system.',
    '• Type dates as real Excel dates or as YYYY-MM-DD. ID numbers (SSS, TIN, …) are text — keep leading zeros.',
    '• Every row is checked before anything is saved; if any row has an error, nothing is imported.',
  ]
  lines.forEach((l, i) => {
    const row = ws.getRow(i + 1)
    row.getCell(1).value = l
    if (i === 0) row.font = { bold: true, size: 14 }
  })
}

/** Builds the workbook for one or more modules, respecting the user's access rights. */
export async function buildWorkbook(payload: Payload, user: User, requests: ExportRequest[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'HR Management System'
  wb.created = new Date()
  const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
  const counts: { sheet: string; rows: number }[] = []
  const sheets: { mod: ModuleDef; docs: Doc[]; extras: Map<unknown, Doc> }[] = []

  for (const r of requests) {
    const docs = await fetchAll(payload, user, r)
    const extras = new Map<unknown, Doc>()
    if (r.module.slug === 'wellness-leaves') {
      const remaining = await remainingAfter(payload, docs as never)
      for (const d of docs) extras.set(d.id, { remainingDays: remaining.get(d.id as number) ?? null })
    }
    sheets.push({ mod: r.module, docs, extras })
    counts.push({ sheet: r.module.sheet, rows: docs.length })
  }
  if (requests.length > 1) readme(wb, counts, settings.companyName ?? 'HR')
  for (const s of sheets) addSheet(wb, s.mod, s.docs, s.extras)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function allModuleRequests(): ExportRequest[] {
  return ALL_MODULES.map((module) => ({ module }))
}

/** An empty workbook with headers, dropdowns and notes — the import template. */
export async function buildTemplate(modules: ModuleDef[] = ALL_MODULES): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  readme(wb, modules.map((m) => ({ sheet: m.sheet, rows: 0 })), 'Import template')
  for (const m of modules) addSheet(wb, m, [], new Map())
  return Buffer.from(await wb.xlsx.writeBuffer())
}
