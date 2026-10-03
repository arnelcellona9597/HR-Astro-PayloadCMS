// Excel import with accuracy guarantees:
//  1. Static checks on every cell (types, dates, fixed lists, ID formats, references, duplicate keys).
//  2. A full rehearsal through Payload (same hooks/validation as the UI) inside a transaction that is
//     always rolled back — this catches business rules such as leave allowances and date order.
//  3. Commit = the same writes in ONE transaction; any failure rolls everything back.
import { formatGovId, roundRating, toYmd, validateEmail, validateGovId, validatePhone } from '@hr/shared'
import { ALL_MODULES, type ModuleDef, type ModuleField } from '@hr/shared/modules'
import ExcelJS from 'exceljs'
import { createLocalReq, type CollectionSlug, type Payload, type PayloadRequest } from 'payload'

import { cleanText } from '../../fields'
import { writeAudit } from '../../hooks/audit'
import { cellDate, cellText, headerKey, isBlank, plainValue } from './cells'

type Doc = Record<string, unknown>
type User = Parameters<Payload['find']>[0]['user']

export const MAX_ROWS_PER_SHEET = 10_000
const MAX_REHEARSAL_ERRORS = 50

export type Issue = { sheet: string; row?: number; column?: string; message: string }

/** A reference to a branch/employee that may only exist later in the same file. */
type Ref = { kind: 'branch' | 'employee'; id?: number; pendingKey?: string }

export type RowPlan = {
  module: ModuleDef
  sheet: string
  row: number
  key: string
  label: string
  action: 'create' | 'update' | 'unchanged'
  id?: number
  data: Doc
  changes: Record<string, { from: unknown; to: unknown }>
}

export type SheetSummary = {
  sheet: string
  module: string
  title: string
  rows: number
  create: number
  update: number
  unchanged: number
  errors: number
}

export type ImportPlan = { sheets: SheetSummary[]; plans: RowPlan[]; errors: Issue[]; warnings: string[] }

const relId = (v: unknown) => (v && typeof v === 'object' ? ((v as Doc).id as number) : (v as number | null | undefined) ?? null)
const lower = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** The value as stored in Payload, normalized for comparison with an incoming cell. */
function storedValue(f: ModuleField, v: unknown): unknown {
  if (v === undefined || v === '') return null
  if (f.kind === 'date') return toYmd(v)
  if (f.kind === 'branch' || f.kind === 'employee') return relId(v)
  return v ?? null
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

type Lookups = {
  branchByName: Map<string, number>
  branchByCode: Map<string, number>
  employeeById: Map<string, number>
  employeeIdOf: Map<number, string>
  pendingBranches: Set<string>
  pendingEmployees: Set<string>
}

/** Parses one cell into the value Payload expects, or returns an error message. */
function parseCell(f: ModuleField, raw: unknown, lk: Lookups, date1904: boolean): { value?: unknown; ref?: Ref; error?: string } {
  if (isBlank(raw)) {
    if (f.required) return { error: 'is required' }
    return { value: null }
  }
  switch (f.kind) {
    case 'date': {
      const r = cellDate(raw, date1904)
      return r.ok ? { value: r.ymd } : { error: r.error }
    }
    case 'number':
    case 'year': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim())
      if (!Number.isFinite(n)) return { error: `"${raw}" is not a number` }
      if (f.kind === 'year' && (!Number.isInteger(n) || n < 2000 || n > 2100)) return { error: `"${raw}" is not a 4-digit year` }
      if (f.min !== undefined && n < f.min) return { error: `must be at least ${f.min}` }
      if (f.max !== undefined && n > f.max) return { error: `must be at most ${f.max}` }
      return { value: f.name === 'rating' ? roundRating(n) : n }
    }
    case 'select': {
      const text = cellText(raw)!
      const match = f.options?.find((o) => o.toLowerCase() === text.toLowerCase())
      return match ? { value: match } : { error: `"${text}" is not one of: ${f.options?.join(', ')}` }
    }
    case 'branch': {
      const text = cellText(raw)!
      const id = lk.branchByName.get(text.toLowerCase()) ?? lk.branchByCode.get(text.toLowerCase())
      if (id) return { ref: { kind: 'branch', id } }
      if (lk.pendingBranches.has(text.toLowerCase())) return { ref: { kind: 'branch', pendingKey: text.toLowerCase() } }
      return { error: `branch "${text}" does not exist — add it on the Branches sheet or the Branches page first` }
    }
    case 'employee': {
      const text = cellText(raw)!
      const id = lk.employeeById.get(text.toLowerCase())
      if (id) return { ref: { kind: 'employee', id } }
      if (lk.pendingEmployees.has(text.toLowerCase())) return { ref: { kind: 'employee', pendingKey: text.toLowerCase() } }
      return { error: `no employee with Employee ID "${text}"` }
    }
    case 'govId': {
      const text = cellText(raw)!
      const err = validateGovId(f.idKind!, text)
      if (err) {
        const hint = typeof raw === 'number' ? ' (Excel may have dropped a leading zero — format the column as Text)' : ''
        return { error: `${err}${hint}` }
      }
      return { value: formatGovId(f.idKind!, text) }
    }
    case 'email': {
      const text = cellText(raw)!
      const err = validateEmail(text)
      return err ? { error: err } : { value: text }
    }
    case 'phone': {
      const text = cellText(raw)!
      const err = validatePhone(text)
      return err ? { error: err } : { value: text }
    }
    case 'textarea': {
      const text = String(plainValue(raw as ExcelJS.CellValue) ?? '').trim()
      return { value: text === '' ? null : text }
    }
    default:
      return { value: cleanText(cellText(raw)) }
  }
}

function moduleForSheet(name: string, hint?: ModuleDef): ModuleDef | undefined {
  const key = headerKey(name)
  return ALL_MODULES.find((m) => headerKey(m.sheet) === key || headerKey(m.title) === key || m.slug === key) ?? hint
}

async function loadLookups(payload: Payload): Promise<Lookups> {
  const [branches, employees] = await Promise.all([
    payload.find({ collection: 'branches', pagination: false, depth: 0, overrideAccess: true, select: { name: true, code: true } }),
    payload.find({ collection: 'employees', pagination: false, depth: 0, overrideAccess: true, select: { employeeId: true } }),
  ])
  return {
    branchByName: new Map(branches.docs.map((b) => [lower(b.name), b.id])),
    branchByCode: new Map(branches.docs.filter((b) => b.code).map((b) => [lower(b.code), b.id])),
    employeeById: new Map(employees.docs.map((e) => [lower(e.employeeId), e.id])),
    employeeIdOf: new Map(employees.docs.map((e) => [e.id, e.employeeId])),
    pendingBranches: new Set(),
    pendingEmployees: new Set(),
  }
}

/** Natural key of a record so a file row can be matched to what's already saved. */
function keyOf(mod: ModuleDef, values: Doc, refs: Record<string, Ref>, lk: Lookups): string {
  return mod.key
    .map((k) => {
      const ref = refs[k]
      if (ref) return ref.id ? `${ref.kind}:${ref.id}` : `pending:${ref.pendingKey}`
      return lower(values[k])
    })
    .join('|')
}

function existingKey(mod: ModuleDef, doc: Doc): string {
  return mod.key
    .map((k) => {
      const f = mod.fields.find((x) => x.name === k)!
      if (f.kind === 'employee') return `employee:${relId(doc[k])}`
      if (f.kind === 'branch') return `branch:${relId(doc[k])}`
      if (f.kind === 'date') return toYmd(doc[k]) ?? ''
      return lower(doc[k])
    })
    .join('|')
}

/** Reads a workbook and works out exactly what importing it would do. Nothing is written. */
export async function analyzeWorkbook(payload: Payload, buffer: ArrayBuffer | Buffer, opts: { moduleHint?: string } = {}): Promise<ImportPlan> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as ArrayBuffer)
  } catch {
    return { sheets: [], plans: [], errors: [{ sheet: '', message: 'This file could not be read. Upload an .xlsx Excel workbook.' }], warnings: [] }
  }
  const date1904 = Boolean((wb.properties as { date1904?: boolean }).date1904)
  const hint = opts.moduleHint ? ALL_MODULES.find((m) => m.slug === opts.moduleHint) : undefined
  const dataSheets = wb.worksheets.filter((ws) => headerKey(ws.name) !== 'readme' && ws.actualRowCount > 0)
  const lk = await loadLookups(payload)
  const errors: Issue[] = []
  const warnings: string[] = []

  type SheetRows = { mod: ModuleDef; ws: ExcelJS.Worksheet; columns: Map<number, ModuleField> }
  const sheets: SheetRows[] = []
  for (const ws of dataSheets) {
    const mod = moduleForSheet(ws.name, dataSheets.length === 1 ? hint : undefined)
    if (!mod) {
      warnings.push(`Sheet "${ws.name}" was ignored (its name doesn't match a module).`)
      continue
    }
    if (sheets.some((s) => s.mod === mod)) {
      errors.push({ sheet: ws.name, message: `Two sheets are for ${mod.title}. Keep only one.` })
      continue
    }
    const columns = new Map<number, ModuleField>()
    const seen = new Set<string>()
    ws.getRow(1).eachCell((cell, col) => {
      const text = String(plainValue(cell.value) ?? '')
      const f = mod.fields.find((x) => headerKey(x.label) === headerKey(text))
      if (!f) {
        if (text.trim()) warnings.push(`${ws.name}: column "${text}" is not recognised and was ignored.`)
        return
      }
      if (seen.has(f.name)) {
        errors.push({ sheet: ws.name, column: f.label, message: 'This column appears twice.' })
        return
      }
      seen.add(f.name)
      if (!f.computed) columns.set(col, f)
    })
    const missing = mod.fields.filter((f) => (f.required || mod.key.includes(f.name)) && !f.computed && !seen.has(f.name))
    if (missing.length) {
      errors.push({ sheet: ws.name, message: `Missing required column(s): ${missing.map((f) => f.label).join(', ')}.` })
      continue
    }
    if (ws.actualRowCount - 1 > MAX_ROWS_PER_SHEET) {
      errors.push({ sheet: ws.name, message: `Too many rows (max ${MAX_ROWS_PER_SHEET.toLocaleString()} per sheet). Split the file.` })
      continue
    }
    sheets.push({ mod, ws, columns })
  }
  // Process in dependency order: branches → holidays → employees → onboarding → leave → requirements.
  sheets.sort((a, b) => ALL_MODULES.indexOf(a.mod) - ALL_MODULES.indexOf(b.mod))

  // Branches and employees created by this same file can be referenced by later sheets.
  for (const s of sheets) {
    if (s.mod.slug !== 'branches' && s.mod.slug !== 'employees') continue
    const keyField = s.mod.slug === 'branches' ? 'name' : 'employeeId'
    const col = [...s.columns.entries()].find(([, f]) => f.name === keyField)?.[0]
    if (!col) continue
    s.ws.eachRow((row, n) => {
      if (n === 1) return
      const v = lower(cellText(plainValue(row.getCell(col).value)))
      if (!v) return
      if (s.mod.slug === 'branches' && !lk.branchByName.has(v)) lk.pendingBranches.add(v)
      if (s.mod.slug === 'employees' && !lk.employeeById.has(v)) lk.pendingEmployees.add(v)
    })
  }

  const plans: RowPlan[] = []
  const summaries: SheetSummary[] = []
  for (const s of sheets) {
    const { mod, ws, columns } = s
    const existing = await payload.find({ collection: mod.slug as CollectionSlug, pagination: false, depth: 0, overrideAccess: true })
    const byKey = new Map((existing.docs as unknown as Doc[]).map((d) => [existingKey(mod, d), d]))
    const fileKeys = new Map<string, number>()
    const summary: SheetSummary = { sheet: ws.name, module: mod.slug, title: mod.title, rows: 0, create: 0, update: 0, unchanged: 0, errors: 0 }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const raw = new Map<ModuleField, unknown>()
      for (const [col, f] of columns) raw.set(f, plainValue(row.getCell(col).value))
      if ([...raw.values()].every(isBlank)) continue
      summary.rows++

      const values: Doc = {}
      const refs: Record<string, Ref> = {}
      let rowHasError = false
      for (const [f, v] of raw) {
        // Blank "copied from employee" columns mean "use the employee's details", not "clear".
        if (f.fromEmployee && isBlank(v)) continue
        const res = parseCell(f, v, lk, date1904)
        if (res.error) {
          errors.push({ sheet: ws.name, row: r, column: f.label, message: res.error })
          rowHasError = true
        } else if (res.ref) refs[f.name] = res.ref
        else values[f.name] = res.value
      }
      if (rowHasError) {
        summary.errors++
        continue
      }
      const key = keyOf(mod, values, refs, lk)
      const dupRow = fileKeys.get(key)
      if (dupRow) {
        errors.push({ sheet: ws.name, row: r, message: `Duplicate of row ${dupRow} (same ${mod.key.map((k) => mod.fields.find((f) => f.name === k)!.label).join(' + ')}).` })
        summary.errors++
        continue
      }
      fileKeys.set(key, r)

      const existingDoc = byKey.get(key)
      const changes: RowPlan['changes'] = {}
      if (existingDoc) {
        for (const f of columns.values()) {
          if (!(f.name in values) && !(f.name in refs)) continue
          const incoming = refs[f.name] ? (refs[f.name]!.id ?? `(new) ${refs[f.name]!.pendingKey}`) : values[f.name]
          const current = storedValue(f, existingDoc[f.name])
          if (!same(incoming, current)) changes[f.name] = { from: current, to: incoming }
        }
      }
      const action: RowPlan['action'] = !existingDoc ? 'create' : Object.keys(changes).length ? 'update' : 'unchanged'
      summary[action]++
      const labelField = mod.fields.find((f) => ['lastName', 'name', 'applicantName', 'employeeId'].includes(f.name))
      const empRef = refs.employee?.id ? lk.employeeIdOf.get(refs.employee.id) : refs.employee?.pendingKey
      plans.push({
        module: mod,
        sheet: ws.name,
        row: r,
        key,
        label: [empRef, labelField ? String(values[labelField.name] ?? existingDoc?.[labelField.name] ?? '') : ''].filter(Boolean).join(' — ') || `Row ${r}`,
        action,
        id: existingDoc ? (existingDoc.id as number) : undefined,
        data: { ...values, ...Object.fromEntries(Object.entries(refs).map(([k, ref]) => [k, ref])) },
        changes,
      })
    }
    summaries.push(summary)
  }

  // Leave allowance checks depend on order: apply filings chronologically.
  plans.sort((a, b) => {
    const m = ALL_MODULES.indexOf(a.module) - ALL_MODULES.indexOf(b.module)
    if (m !== 0 || a.module.slug !== 'wellness-leaves') return m
    return String(a.data.inclusiveDateFrom).localeCompare(String(b.data.inclusiveDateFrom)) || a.row - b.row
  })
  return { sheets: summaries, plans, errors, warnings }
}

/** Turns a Payload error into a row issue pointing at the right column. */
function issueFrom(plan: RowPlan, err: unknown): Issue {
  const e = err as { message?: string; data?: { errors?: { path?: string; message?: string }[] } }
  const first = e.data?.errors?.[0]
  if (first) {
    const f = plan.module.fields.find((x) => x.name === first.path)
    return { sheet: plan.sheet, row: plan.row, column: f?.label ?? first.path, message: first.message ?? 'Invalid value' }
  }
  let message = e.message ?? String(err)
  if (/UNIQUE constraint/i.test(message)) message = 'A record with the same unique value already exists.'
  return { sheet: plan.sheet, row: plan.row, message }
}

type ApplyState = { created: Map<string, number> }

async function applyOne(payload: Payload, req: PayloadRequest, plan: RowPlan, state: ApplyState) {
  if (plan.action === 'unchanged') return
  const data: Doc = {}
  for (const [k, v] of Object.entries(plan.data)) {
    if (v && typeof v === 'object' && 'kind' in (v as Ref)) {
      const ref = v as Ref
      data[k] = ref.id ?? state.created.get(`${ref.kind}:${ref.pendingKey}`)
      if (!data[k]) throw new Error(`Could not resolve ${ref.kind} "${ref.pendingKey}" (its own row failed).`)
    } else data[k] = v
  }
  const collection = plan.module.slug as CollectionSlug
  const doc = (
    plan.action === 'create'
      ? await payload.create({ collection, data: data as never, req, overrideAccess: false, depth: 0 })
      : await payload.update({ collection, id: plan.id!, data: data as never, req, overrideAccess: false, depth: 0 })
  ) as unknown as Doc
  if (plan.module.slug === 'branches') state.created.set(`branch:${lower(doc.name)}`, doc.id as number)
  if (plan.module.slug === 'employees') state.created.set(`employee:${lower(doc.employeeId)}`, doc.id as number)
  await writeAudit(req, {
    action: 'import',
    collectionSlug: plan.module.slug,
    docId: doc.id as number,
    docLabel: (doc.fullName ?? doc.name ?? doc.applicantName ?? doc.lastName ?? plan.label) as string,
    changes: plan.action === 'create' ? { created: { from: null, to: `row ${plan.row} of ${plan.sheet}` } } : plan.changes,
  })
}

async function newRequest(payload: Payload, user: User): Promise<PayloadRequest> {
  const req = await createLocalReq({ user: user as never, context: { skipAudit: true } }, payload)
  req.transactionID = (await payload.db.beginTransaction()) ?? undefined
  if (!req.transactionID) throw new Error('Database transactions are not enabled; refusing to import without them.')
  return req
}

/**
 * Runs every change through Payload's real validation inside a transaction and always rolls it back.
 * Returns the problems found (row by row). Earlier good rows are replayed after a failure so later
 * rows are checked against the same state the real import would see.
 */
export async function rehearse(payload: Payload, user: User, plan: ImportPlan): Promise<Issue[]> {
  const issues: Issue[] = []
  const work = plan.plans.filter((p) => p.action !== 'unchanged')
  if (!work.length) return issues
  let req = await newRequest(payload, user)
  let state: ApplyState = { created: new Map() }
  const done: RowPlan[] = []
  try {
    for (const p of work) {
      try {
        await applyOne(payload, req, p, state)
        done.push(p)
      } catch (err) {
        issues.push(issueFrom(p, err))
        if (issues.length >= MAX_REHEARSAL_ERRORS) break
        // Payload rolled the transaction back; rebuild the state of the rows that were fine.
        if (req.transactionID) await payload.db.rollbackTransaction(req.transactionID).catch(() => {})
        req = await newRequest(payload, user)
        state = { created: new Map() }
        for (const d of done) await applyOne(payload, req, d, state)
      }
    }
  } finally {
    if (req.transactionID) await payload.db.rollbackTransaction(req.transactionID).catch(() => {})
  }
  return issues
}

export type CommitResult = { ok: true; created: number; updated: number; unchanged: number } | { ok: false; issue: Issue }

/** Writes the whole plan in one transaction. Either every row is saved or none is. */
export async function commit(payload: Payload, user: User, plan: ImportPlan): Promise<CommitResult> {
  const req = await newRequest(payload, user)
  const state: ApplyState = { created: new Map() }
  for (const p of plan.plans) {
    try {
      await applyOne(payload, req, p, state)
    } catch (err) {
      if (req.transactionID) await payload.db.rollbackTransaction(req.transactionID).catch(() => {})
      return { ok: false, issue: issueFrom(p, err) }
    }
  }
  await payload.db.commitTransaction(req.transactionID!)
  return {
    ok: true,
    created: plan.plans.filter((p) => p.action === 'create').length,
    updated: plan.plans.filter((p) => p.action === 'update').length,
    unchanged: plan.plans.filter((p) => p.action === 'unchanged').length,
  }
}

/** Full check used for the preview: static analysis, then a rolled-back rehearsal if that passed. */
export async function validateImport(payload: Payload, user: User, buffer: ArrayBuffer | Buffer, opts: { moduleHint?: string } = {}) {
  const plan = await analyzeWorkbook(payload, buffer, opts)
  if (plan.errors.length === 0 && plan.plans.length > 0) {
    const issues = await rehearse(payload, user, plan)
    plan.errors.push(...issues)
    for (const issue of issues) {
      const s = plan.sheets.find((x) => x.sheet === issue.sheet)
      if (s) s.errors++
    }
  }
  return plan
}
