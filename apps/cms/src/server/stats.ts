// Aggregate numbers for the dashboards, computed with SQL GROUP BY so they stay fast and exact
// no matter how many employees there are. Only call these for signed-in staff.
import { sql } from '@payloadcms/db-sqlite'
import type { SQL } from 'drizzle-orm'
import type { Payload } from 'payload'

type Row = Record<string, unknown>

async function all<T extends Row>(payload: Payload, query: SQL): Promise<T[]> {
  const db = payload.db.drizzle as unknown as { all: (q: SQL) => Promise<T[]> }
  return db.all(query)
}

export type EmployeeFilter = {
  branchId?: number | null
  classification?: string | null
  /** 'active' = only Active employees (default for headcount-style charts), 'all' = everyone */
  scope?: 'active' | 'all'
}

function where(f: EmployeeFilter, alias = 'e', includeScope = true): SQL {
  const parts: SQL[] = [sql`1 = 1`]
  if (f.branchId) parts.push(sql`${sql.raw(alias)}.station_id = ${f.branchId}`)
  if (f.classification) parts.push(sql`${sql.raw(alias)}.classification = ${f.classification}`)
  if (includeScope && f.scope !== 'all') parts.push(sql`${sql.raw(alias)}.employment_status = 'Active'`)
  return sql.join(parts, sql` AND `)
}

const num = (v: unknown) => Number(v ?? 0)

export async function employeeStats(payload: Payload, f: EmployeeFilter = {}) {
  const [byStatus, byStatusGender, byClassification, positions, hires, separations, total] = await Promise.all([
    all<{ status: string; count: number }>(
      payload,
      sql`SELECT employment_status AS status, COUNT(*) AS count FROM employees e WHERE ${where(f, 'e', false)} GROUP BY employment_status`,
    ),
    all<{ status: string; gender: string; count: number }>(
      payload,
      sql`SELECT employment_status AS status, gender, COUNT(*) AS count FROM employees e WHERE ${where(f, 'e', false)} GROUP BY employment_status, gender`,
    ),
    all<{ classification: string; status: string; count: number }>(
      payload,
      sql`SELECT classification, employment_status AS status, COUNT(*) AS count FROM employees e WHERE ${where(f, 'e', false)} GROUP BY classification, employment_status`,
    ),
    all<{ position: string; gender: string; count: number }>(
      payload,
      sql`SELECT COALESCE(NULLIF(TRIM(position), ''), '(No position)') AS position, gender, COUNT(*) AS count
          FROM employees e WHERE ${where(f)} GROUP BY 1, gender`,
    ),
    all<{ year: string; count: number }>(
      payload,
      sql`SELECT substr(date_hired, 1, 4) AS year, COUNT(*) AS count FROM employees e
          WHERE ${where(f, 'e', false)} AND date_hired IS NOT NULL GROUP BY 1 ORDER BY 1`,
    ),
    all<{ year: string; status: string; count: number }>(
      payload,
      sql`SELECT substr(last_day_of_service, 1, 4) AS year, employment_status AS status, COUNT(*) AS count FROM employees e
          WHERE ${where(f, 'e', false)} AND employment_status <> 'Active' AND last_day_of_service IS NOT NULL GROUP BY 1, 2 ORDER BY 1`,
    ),
    all<{ count: number }>(payload, sql`SELECT COUNT(*) AS count FROM employees e WHERE ${where(f, 'e', false)}`),
  ])

  // Positions: total per title (sorted), split by gender for the tooltip/table.
  const posMap = new Map<string, { position: string; total: number; Male: number; Female: number }>()
  for (const r of positions) {
    const p = posMap.get(r.position) ?? { position: r.position, total: 0, Male: 0, Female: 0 }
    p.total += num(r.count)
    if (r.gender === 'Male' || r.gender === 'Female') p[r.gender] += num(r.count)
    posMap.set(r.position, p)
  }

  return {
    total: num(total[0]?.count),
    byStatus: byStatus.map((r) => ({ status: r.status, count: num(r.count) })),
    byStatusGender: byStatusGender.map((r) => ({ status: r.status, gender: r.gender, count: num(r.count) })),
    byClassification: byClassification.map((r) => ({ classification: r.classification, status: r.status, count: num(r.count) })),
    positions: [...posMap.values()].sort((a, b) => b.total - a.total || a.position.localeCompare(b.position)),
    hires: hires.map((r) => ({ year: Number(r.year), count: num(r.count) })),
    separations: separations.map((r) => ({ year: Number(r.year), status: r.status, count: num(r.count) })),
  }
}

/** Employees per branch, split by classification. `scope: 'active'` counts only Active employees. */
export async function branchCounts(payload: Payload, scope: 'active' | 'all' = 'active') {
  const statusFilter = scope === 'all' ? sql`` : sql`AND e.employment_status = 'Active'`
  const rows = await all<{ branchId: number | null; classification: string | null; count: number }>(
    payload,
    sql`SELECT b.id AS branchId, e.classification AS classification, COUNT(e.id) AS count
        FROM branches b LEFT JOIN employees e ON e.station_id = b.id ${statusFilter}
        GROUP BY b.id, e.classification`,
  )
  const unassigned = await all<{ classification: string; count: number }>(
    payload,
    sql`SELECT classification, COUNT(*) AS count FROM employees e WHERE e.station_id IS NULL ${statusFilter} GROUP BY classification`,
  )
  const map = new Map<number, Record<string, number>>()
  for (const r of rows) {
    if (r.branchId == null) continue
    const m = map.get(r.branchId) ?? { COS: 0, Contractual: 0, Regular: 0, total: 0 }
    if (r.classification) {
      m[r.classification] = (m[r.classification] ?? 0) + num(r.count)
      m.total! += num(r.count)
    }
    map.set(r.branchId, m)
  }
  const none: Record<string, number> = { COS: 0, Contractual: 0, Regular: 0, total: 0 }
  for (const r of unassigned) {
    none[r.classification] = num(r.count)
    none.total! += num(r.count)
  }
  return { byBranch: map, unassigned: none }
}

export async function leaveStats(payload: Payload, year: number) {
  const y = String(year)
  const [byMonth, byStatus, topUsers, employeesWithLeave] = await Promise.all([
    all<{ month: string; filings: number; days: number }>(
      payload,
      sql`SELECT substr(inclusive_date_from, 6, 2) AS month, COUNT(*) AS filings, SUM(days) AS days FROM wellness_leaves
          WHERE substr(inclusive_date_from, 1, 4) = ${y} AND status IN ('Approved', 'Pending') GROUP BY 1 ORDER BY 1`,
    ),
    all<{ status: string; count: number }>(
      payload,
      sql`SELECT status, COUNT(*) AS count FROM wellness_leaves WHERE substr(inclusive_date_from, 1, 4) = ${y} GROUP BY status`,
    ),
    all<{ employeeId: number; name: string; days: number }>(
      payload,
      sql`SELECT w.employee_id AS employeeId, e.full_name AS name,
            SUM(COALESCE(json_extract(w.days_by_year, '$."' || ${y} || '"'), 0)) AS days
          FROM wellness_leaves w JOIN employees e ON e.id = w.employee_id
          WHERE w.status IN ('Approved', 'Pending') AND json_extract(w.days_by_year, '$."' || ${y} || '"') IS NOT NULL
          GROUP BY w.employee_id ORDER BY days DESC, name LIMIT 15`,
    ),
    all<{ count: number }>(
      payload,
      sql`SELECT COUNT(DISTINCT employee_id) AS count FROM wellness_leaves
          WHERE status IN ('Approved', 'Pending') AND json_extract(days_by_year, '$."' || ${y} || '"') IS NOT NULL`,
    ),
  ])
  return {
    byMonth: byMonth.map((r) => ({ month: Number(r.month), filings: num(r.filings), days: num(r.days) })),
    byStatus: byStatus.map((r) => ({ status: r.status, count: num(r.count) })),
    topUsers: topUsers.map((r) => ({ employeeId: r.employeeId, name: r.name, days: num(r.days) })),
    employeesWithLeave: num(employeesWithLeave[0]?.count),
  }
}

/** Per-employee days used in `year`, for remaining-balance columns. */
export async function leaveUsageByEmployee(payload: Payload, year: number): Promise<Map<number, number>> {
  const y = String(year)
  const rows = await all<{ employeeId: number; days: number }>(
    payload,
    sql`SELECT employee_id AS employeeId, SUM(COALESCE(json_extract(days_by_year, '$."' || ${y} || '"'), 0)) AS days
        FROM wellness_leaves WHERE status IN ('Approved', 'Pending') GROUP BY employee_id`,
  )
  return new Map(rows.map((r) => [Number(r.employeeId), num(r.days)]))
}

export async function onboardingStats(payload: Payload) {
  const [byStatus, byReq] = await Promise.all([
    all<{ status: string; count: number }>(
      payload,
      sql`SELECT application_status AS status, COUNT(*) AS count FROM applications GROUP BY 1`,
    ),
    all<{ status: string; count: number }>(
      payload,
      sql`SELECT requirements_status AS status, COUNT(*) AS count FROM applications
          WHERE application_status NOT IN ('Not Hired', 'Withdrawn') GROUP BY 1`,
    ),
  ])
  return {
    byStatus: byStatus.map((r) => ({ status: r.status, count: num(r.count) })),
    byRequirements: byReq.map((r) => ({ status: r.status, count: num(r.count) })),
  }
}

const COMPLIANCE_TABLES: Record<string, string> = {
  'itr-submissions': 'itr_submissions',
  'sworn-declarations': 'sworn_declarations',
  'pds-submissions': 'pds_submissions',
  'ipcr-ratings': 'ipcr_ratings',
}

/**
 * Compliance for one requirement and year among currently Active employees.
 * "Complied" = a record exists with a Date Submitted.
 */
export async function complianceStats(payload: Payload, slug: string, year: number) {
  const table = COMPLIANCE_TABLES[slug]
  if (!table) throw new Error(`Unknown requirement ${slug}`)
  const t = sql.raw(`"${table}"`)
  const rows = await all<{ id: number; complied: number; recorded: number }>(
    payload,
    sql`SELECT e.id AS id,
          MAX(CASE WHEN r.date_submitted IS NOT NULL THEN 1 ELSE 0 END) AS complied,
          MAX(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS recorded
        FROM employees e LEFT JOIN ${t} r ON r.employee_id = e.id AND r.year = ${year}
        WHERE e.employment_status = 'Active' GROUP BY e.id`,
  )
  const active = rows.length
  const complied = rows.filter((r) => num(r.complied) === 1).length
  const missingIds = rows.filter((r) => num(r.complied) !== 1).map((r) => Number(r.id))
  return { active, complied, missing: active - complied, missingIds }
}

/** Payslip count and totals per payroll period. */
export async function payrollTotals(payload: Payload): Promise<Map<number, { count: number; gross: number; net: number; corrected: number }>> {
  const rows = await all<{ periodId: number; count: number; gross: number; net: number; corrected: number }>(
    payload,
    sql`SELECT period_id AS periodId, COUNT(*) AS count, ROUND(SUM(gross_pay), 2) AS gross, ROUND(SUM(net_pay), 2) AS net,
          SUM(CASE WHEN corrected_after_release = 1 THEN 1 ELSE 0 END) AS corrected
        FROM payslips GROUP BY period_id`,
  )
  return new Map(rows.map((r) => [Number(r.periodId), { count: num(r.count), gross: num(r.gross), net: num(r.net), corrected: num(r.corrected) }]))
}
