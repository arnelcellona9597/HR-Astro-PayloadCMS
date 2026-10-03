import { countWorkdays, toYmd, type WorkdayCount } from '@hr/shared'
import type { Payload, PayloadRequest } from 'payload'

import { allowanceForYear } from '../globals/LeaveSettings'

/** Filings in these statuses use up the yearly allowance. */
export const COUNTED_LEAVE_STATUSES = ['Approved', 'Pending'] as const
export const LEAVE_STATUSES = ['Approved', 'Pending', 'Disapproved', 'Cancelled'] as const

type LeaveLike = {
  id?: number | string
  inclusiveDateFrom?: string | null
  inclusiveDateTo?: string | null
  daysByYear?: Record<string, number> | null
  status?: string | null
}

export type LeaveCheck = {
  ok: boolean
  error?: string
  count?: WorkdayCount
  /** Per year: allowance, days used by other filings, and what remains after this filing. */
  years: { year: number; allowance: number; usedBefore: number; thisFiling: number; remaining: number }[]
}

async function holidaysBetween(payload: Payload, from: string, to: string, req?: PayloadRequest): Promise<string[]> {
  const res = await payload.find({
    collection: 'holidays',
    where: {
      and: [{ date: { greater_than_equal: `${from}T00:00:00.000Z` } }, { date: { less_than_equal: `${to}T23:59:59.999Z` } }],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return res.docs.map((h) => toYmd(h.date)).filter((d): d is string => Boolean(d))
}

/** Other counted filings of the employee that touch any of the given years. */
export async function otherLeaves(
  payload: Payload,
  employeeId: number | string,
  years: number[],
  excludeId?: number | string,
  req?: PayloadRequest,
): Promise<LeaveLike[]> {
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const res = await payload.find({
    collection: 'wellness-leaves',
    where: {
      and: [
        { employee: { equals: employeeId } },
        { status: { in: [...COUNTED_LEAVE_STATUSES] } },
        { inclusiveDateFrom: { less_than_equal: `${maxYear}-12-31T23:59:59.999Z` } },
        { inclusiveDateTo: { greater_than_equal: `${minYear}-01-01T00:00:00.000Z` } },
        ...(excludeId != null ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return res.docs as LeaveLike[]
}

export function daysUsedInYear(leaves: LeaveLike[], year: number): number {
  return leaves.reduce((sum, l) => sum + (l.daysByYear?.[String(year)] ?? 0), 0)
}

/**
 * Validates a wellness leave filing: counts its working days and makes sure no year's allowance
 * is exceeded and that it doesn't overlap another filing. Used by the save hook and the live preview.
 */
export async function checkLeave(
  payload: Payload,
  input: { employee: number | string; from: string; to: string; status?: string | null; excludeId?: number | string },
  req?: PayloadRequest,
): Promise<LeaveCheck> {
  const from = toYmd(input.from)
  const to = toYmd(input.to)
  if (!from || !to) return { ok: false, error: 'Enter valid inclusive dates.', years: [] }
  if (to < from) return { ok: false, error: 'The inclusive end date is before the start date.', years: [] }

  let count: WorkdayCount
  try {
    count = countWorkdays(from, to, await holidaysBetween(payload, from, to, req))
  } catch (err) {
    return { ok: false, error: (err as Error).message, years: [] }
  }
  if (count.total === 0) {
    return { ok: false, error: 'The selected dates contain no working days (weekends/holidays only).', count, years: [] }
  }

  const years = Object.keys(count.byYear).map(Number)
  const settings = await payload.findGlobal({ slug: 'leave-settings', overrideAccess: true, req })
  const others = await otherLeaves(payload, input.employee, years, input.excludeId, req)

  const overlap = others.find((l) => {
    const lf = toYmd(l.inclusiveDateFrom)
    const lt = toYmd(l.inclusiveDateTo)
    return lf && lt && lf <= to && lt >= from
  })

  const counted = !input.status || (COUNTED_LEAVE_STATUSES as readonly string[]).includes(input.status)
  const summary = years.map((year) => {
    const allowance = allowanceForYear(settings, year)
    const usedBefore = daysUsedInYear(others, year)
    const thisFiling = counted ? count.byYear[year]! : 0
    return { year, allowance, usedBefore, thisFiling, remaining: allowance - usedBefore - thisFiling }
  })

  if (counted && overlap) {
    return {
      ok: false,
      error: `These dates overlap another filing (${toYmd(overlap.inclusiveDateFrom)} to ${toYmd(overlap.inclusiveDateTo)}).`,
      count,
      years: summary,
    }
  }
  const over = summary.find((y) => y.remaining < 0)
  if (over) {
    const left = Math.max(0, over.allowance - over.usedBefore)
    return {
      ok: false,
      error: `Exceeds the ${over.year} wellness leave allowance: ${left} of ${over.allowance} day(s) left, this filing needs ${over.thisFiling}.`,
      count,
      years: summary,
    }
  }
  return { ok: true, count, years: summary }
}

type LedgerRow = {
  id: number
  employee: number | { id: number }
  inclusiveDateFrom: string
  status?: string | null
  daysByYear?: Record<string, number> | null
}

/**
 * Remaining wellness days after each filing, in the filing's starting year, counting filings in date
 * order. Computed on read (never stored) so it stays right when earlier filings are edited or cancelled.
 */
export async function remainingAfter(payload: Payload, rows: LedgerRow[]): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (!rows.length) return out
  const empId = (r: LedgerRow) => (typeof r.employee === 'object' ? r.employee.id : r.employee)
  const employees = [...new Set(rows.map(empId))]
  const years = [...new Set(rows.map((r) => Number(r.inclusiveDateFrom.slice(0, 4))))]
  const settings = await payload.findGlobal({ slug: 'leave-settings', overrideAccess: true })
  const all = await payload.find({
    collection: 'wellness-leaves',
    where: {
      and: [
        { employee: { in: employees } },
        { status: { in: [...COUNTED_LEAVE_STATUSES] } },
        { inclusiveDateFrom: { less_than_equal: `${Math.max(...years)}-12-31T23:59:59.999Z` } },
        { inclusiveDateTo: { greater_than_equal: `${Math.min(...years) - 1}-01-01T00:00:00.000Z` } },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { employee: true, inclusiveDateFrom: true, daysByYear: true, status: true },
  })
  const ordered = (all.docs as LedgerRow[]).sort(
    (a, b) => a.inclusiveDateFrom.localeCompare(b.inclusiveDateFrom) || a.id - b.id,
  )
  for (const row of rows) {
    const year = Number(row.inclusiveDateFrom.slice(0, 4))
    const e = empId(row)
    let used = 0
    for (const l of ordered) {
      if (empId(l) !== e) continue
      if (l.inclusiveDateFrom > row.inclusiveDateFrom || (l.inclusiveDateFrom === row.inclusiveDateFrom && l.id > row.id)) break
      used += l.daysByYear?.[String(year)] ?? 0
    }
    // A cancelled/disapproved filing shows the balance as of its date without consuming days.
    out.set(row.id, allowanceForYear(settings, year) - used)
  }
  return out
}
